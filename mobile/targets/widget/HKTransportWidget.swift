import CoreLocation
import SwiftUI
import WidgetKit

// MARK: - Constants

private let apiURL = "https://hk.transport.mcprouter.app/api/arrivals"
private let suiteName = "group.com.rxlab.hktransport"
private let configKey = "widgetStopConfig"

// MARK: - Network fetch

func fetchArrivals(stops: [ArrivalsRequest.StopReq]) async -> ArrivalsResponse? {
  guard let url = URL(string: apiURL) else { return nil }

  var request = URLRequest(url: url)
  request.httpMethod = "POST"
  request.setValue("application/json", forHTTPHeaderField: "Content-Type")
  request.timeoutInterval = 15

  let body = ArrivalsRequest(stops: stops)
  guard let data = try? JSONEncoder().encode(body) else { return nil }
  request.httpBody = data

  do {
    let (responseData, response) = try await URLSession.shared.data(for: request)
    let httpResponse = response as? HTTPURLResponse
    print("[Widget] HTTP \(httpResponse?.statusCode ?? -1), body: \(String(data: responseData.prefix(500), encoding: .utf8) ?? "nil")")
    guard httpResponse?.statusCode == 200 else { return nil }
    return try JSONDecoder().decode(ArrivalsResponse.self, from: responseData)
  } catch {
    print("[Widget] fetch error: \(error)")
    return nil
  }
}

private func toWidgetData(title: String, apiStops: [ArrivalsResponse.APIStop]) -> WidgetArrivalsData {
  WidgetArrivalsData(
    title: title,
    stops: apiStops.prefix(8).map { stop in
      WidgetStop(
        name: stop.localizedName,
        arrivals: (stop.arrivals ?? []).prefix(8).map { arrival in
          WidgetArrival(
            route: arrival.route,
            destination: arrival.localizedDestination,
            etas: (arrival.etas ?? []).prefix(3).map { eta in
              WidgetEta(minutes: eta.minutes, remarks: eta.remarks ?? "")
            }
          )
        }
      )
    },
    updatedAt: Double(Date().timeIntervalSince1970 * 1000)
  )
}

// MARK: - Location helper

private class LocationDelegate: NSObject, CLLocationManagerDelegate {
  var continuation: CheckedContinuation<CLLocation?, Never>?

  func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
    manager.stopUpdatingLocation()
    continuation?.resume(returning: locations.first)
    continuation = nil
  }

  func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
    manager.stopUpdatingLocation()
    continuation?.resume(returning: nil)
    continuation = nil
  }
}

private func getCurrentLocation() async -> CLLocation? {
  let manager = CLLocationManager()
  let delegate = LocationDelegate()
  manager.delegate = delegate
  manager.desiredAccuracy = kCLLocationAccuracyHundredMeters

  let status = manager.authorizationStatus
  guard status == .authorizedWhenInUse || status == .authorizedAlways else {
    return nil
  }

  return await withCheckedContinuation { continuation in
    delegate.continuation = continuation
    manager.requestLocation()
  }
}

// MARK: - Timeline Provider

struct Provider: TimelineProvider {
  func placeholder(in context: Context) -> ArrivalsEntry {
    ArrivalsEntry(date: Date(), data: nil, status: .placeholder)
  }

  func getSnapshot(in context: Context, completion: @escaping (ArrivalsEntry) -> Void) {
    if context.isPreview {
      completion(ArrivalsEntry(date: Date(), data: nil, status: .placeholder))
      return
    }
    Task {
      let entry = await loadEntry()
      completion(entry)
    }
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<ArrivalsEntry>) -> Void) {
    Task {
      let entry = await loadEntry()
      let nextRefresh = Calendar.current.date(byAdding: .minute, value: 5, to: Date())!
      completion(Timeline(entries: [entry], policy: .after(nextRefresh)))
    }
  }

  private func loadEntry() async -> ArrivalsEntry {
    print("[Widget] loadEntry called")

    // 1. Check if app has set a stop config
    if let config = loadConfig(), !config.stops.isEmpty {
      print("[Widget] config found: \(config.stops.count) stops")
      let stopReqs = config.stops.map {
        ArrivalsRequest.StopReq(id: $0.id, lat: $0.lat, lng: $0.lng)
      }
      if let response = await fetchArrivals(stops: stopReqs),
         let apiStops = response.stops, !apiStops.isEmpty
      {
        let data = toWidgetData(title: config.title, apiStops: apiStops)
        return ArrivalsEntry(date: Date(), data: data, status: .loaded)
      }
      return ArrivalsEntry(date: Date(), data: nil, status: .fetchFailed)
    }

    // 2. No config — use device location if available, otherwise default HK location
    print("[Widget] no config, fetching nearby...")
    var lat = 22.2796
    var lng = 114.1774
    let manager = CLLocationManager()
    if manager.authorizationStatus == .authorizedAlways || manager.authorizationStatus == .authorizedWhenInUse,
       let loc = manager.location
    {
      lat = loc.coordinate.latitude
      lng = loc.coordinate.longitude
    }
    print("[Widget] using lat=\(lat) lng=\(lng)")

    let stopReqs = [ArrivalsRequest.StopReq(id: nil, lat: lat, lng: lng)]
    if let response = await fetchArrivals(stops: stopReqs),
       let apiStops = response.stops, !apiStops.isEmpty
    {
      print("[Widget] got \(apiStops.count) stops")
      let data = toWidgetData(title: "Nearby", apiStops: apiStops)
      return ArrivalsEntry(date: Date(), data: data, status: .loaded)
    }
    print("[Widget] fetch failed or empty response")
    return ArrivalsEntry(date: Date(), data: nil, status: .fetchFailed)
  }

  private func loadConfig() -> WidgetStopConfig? {
    guard let defaults = UserDefaults(suiteName: suiteName) else {
      print("[Widget] loadConfig: UserDefaults suite not found")
      return nil
    }
    guard let jsonString = defaults.string(forKey: configKey) else {
      print("[Widget] loadConfig: no value for key '\(configKey)'")
      return nil
    }
    print("[Widget] loadConfig: raw JSON = \(jsonString.prefix(500))")
    guard let jsonData = jsonString.data(using: .utf8) else {
      print("[Widget] loadConfig: failed to convert to Data")
      return nil
    }
    do {
      let config = try JSONDecoder().decode(WidgetStopConfig.self, from: jsonData)
      print("[Widget] loadConfig: decoded \(config.stops.count) stops, title=\(config.title)")
      return config
    } catch {
      print("[Widget] loadConfig: decode error: \(error)")
      return nil
    }
  }
}

// MARK: - Entry

enum EntryStatus {
  case placeholder
  case loaded
  case noConfig
  case fetchFailed
}

struct ArrivalsEntry: TimelineEntry {
  let date: Date
  let data: WidgetArrivalsData?
  let status: EntryStatus
}

// MARK: - ETA Color

func etaColor(_ minutes: Int) -> Color {
  if minutes <= 0 { return Color(red: 1.0, green: 0.271, blue: 0.227) }
  if minutes <= 3 { return Color(red: 0.188, green: 0.820, blue: 0.345) }
  if minutes <= 10 { return Color(red: 1.0, green: 0.839, blue: 0.039) }
  return Color.gray
}

func etaText(_ minutes: Int) -> String {
  if minutes <= 0 { return "Left" }
  return "\(minutes)m"
}

// MARK: - Small Widget

struct SmallWidgetView: View {
  let entry: ArrivalsEntry

  var body: some View {
    if let data = entry.data, !data.stops.isEmpty {
      let stop = data.stops[0]
      VStack(alignment: .leading, spacing: 6) {
        HStack {
          Text(stop.name)
            .font(.caption2)
            .fontWeight(.semibold)
            .foregroundColor(.secondary)
            .lineLimit(1)
          Spacer()
        }

        ForEach(Array(stop.arrivals.prefix(2).enumerated()), id: \.offset) { _, arrival in
          HStack(spacing: 6) {
            Text(arrival.route)
              .font(.subheadline)
              .fontWeight(.bold)
              .lineLimit(1)
              .frame(minWidth: 28, alignment: .leading)

            Spacer()

            if let eta = arrival.etas.first {
              Text(etaText(eta.minutes))
                .font(.subheadline)
                .fontWeight(.semibold)
                .foregroundColor(etaColor(eta.minutes))
            }
          }
        }

        Spacer()
      }
      .padding()
    } else {
      VStack(spacing: 8) {
        Image(systemName: "bus.fill")
          .font(.title2)
          .foregroundColor(.secondary)
        Text(emptyMessage(entry.status))
          .font(.caption)
          .foregroundColor(.secondary)
          .multilineTextAlignment(.center)
      }
      .padding()
    }
  }
}

// MARK: - Row truncation helper

private func truncateStops(_ stops: [WidgetStop], maxRows: Int) -> [(stop: WidgetStop, arrivalCount: Int)] {
  var rows = 0
  var result: [(stop: WidgetStop, arrivalCount: Int)] = []
  for stop in stops {
    rows += 1
    if rows > maxRows { break }
    let available = min(stop.arrivals.count, maxRows - rows)
    result.append((stop: stop, arrivalCount: available))
    rows += available
    if rows >= maxRows { break }
  }
  return result
}

// MARK: - Medium Widget

struct MediumWidgetView: View {
  let entry: ArrivalsEntry

  var body: some View {
    if let data = entry.data, !data.stops.isEmpty {
      VStack(alignment: .leading, spacing: 4) {
        HStack {
          if !data.title.isEmpty {
            Text(data.title)
              .font(.caption2)
              .fontWeight(.semibold)
              .foregroundColor(.secondary)
              .lineLimit(1)
          }
          Spacer()
        }

        let truncated = truncateStops(data.stops, maxRows: 4)
        ForEach(Array(truncated.enumerated()), id: \.offset) { stopIdx, item in
          if stopIdx > 0 {
            Divider()
          }

          Text(item.stop.name)
            .font(.caption)
            .fontWeight(.semibold)
            .foregroundColor(.primary)
            .lineLimit(1)

          ForEach(Array(item.stop.arrivals.prefix(item.arrivalCount).enumerated()), id: \.offset) { _, arrival in
            HStack(spacing: 4) {
              Text(arrival.route)
                .font(.caption)
                .fontWeight(.bold)
                .frame(minWidth: 32, alignment: .leading)

              Text(arrival.destination)
                .font(.caption2)
                .foregroundColor(.secondary)
                .lineLimit(1)

              Spacer()

              HStack(spacing: 3) {
                ForEach(Array(arrival.etas.prefix(3).enumerated()), id: \.offset) { _, eta in
                  Text(etaText(eta.minutes))
                    .font(.caption2)
                    .fontWeight(.semibold)
                    .foregroundColor(.white)
                    .padding(.horizontal, 5)
                    .padding(.vertical, 2)
                    .background(etaColor(eta.minutes))
                    .cornerRadius(4)
                }
              }
            }
          }
        }

        Spacer(minLength: 0)
      }
      .padding()
    } else {
      HStack {
        Spacer()
        VStack(spacing: 8) {
          Image(systemName: "bus.fill")
            .font(.title2)
            .foregroundColor(.secondary)
          Text(emptyMessage(entry.status))
            .font(.caption)
            .foregroundColor(.secondary)
        }
        Spacer()
      }
      .padding()
    }
  }
}

// MARK: - Large Widget

struct LargeWidgetView: View {
  let entry: ArrivalsEntry

  var body: some View {
    if let data = entry.data, !data.stops.isEmpty {
      VStack(alignment: .leading, spacing: 6) {
        HStack {
          if !data.title.isEmpty {
            Text(data.title)
              .font(.caption)
              .fontWeight(.semibold)
              .foregroundColor(.secondary)
              .lineLimit(1)
          }
          Spacer()
        }

        let truncated = truncateStops(data.stops, maxRows: 8)
        ForEach(Array(truncated.enumerated()), id: \.offset) { stopIdx, item in
          if stopIdx > 0 {
            Divider()
          }

          Text(item.stop.name)
            .font(.subheadline)
            .fontWeight(.semibold)
            .foregroundColor(.primary)
            .lineLimit(1)

          ForEach(Array(item.stop.arrivals.prefix(item.arrivalCount).enumerated()), id: \.offset) { _, arrival in
            HStack(spacing: 6) {
              Text(arrival.route)
                .font(.subheadline)
                .fontWeight(.bold)
                .frame(minWidth: 36, alignment: .leading)

              Text(arrival.destination)
                .font(.caption)
                .foregroundColor(.secondary)
                .lineLimit(1)

              Spacer()

              HStack(spacing: 3) {
                ForEach(Array(arrival.etas.prefix(3).enumerated()), id: \.offset) { _, eta in
                  Text(etaText(eta.minutes))
                    .font(.caption)
                    .fontWeight(.semibold)
                    .foregroundColor(.white)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 3)
                    .background(etaColor(eta.minutes))
                    .cornerRadius(5)
                }
              }
            }
          }
        }

        Spacer(minLength: 0)
      }
      .padding()
    } else {
      HStack {
        Spacer()
        VStack(spacing: 8) {
          Image(systemName: "bus.fill")
            .font(.title2)
            .foregroundColor(.secondary)
          Text(emptyMessage(entry.status))
            .font(.caption)
            .foregroundColor(.secondary)
        }
        Spacer()
      }
      .padding()
    }
  }
}

// MARK: - Empty state message

private func emptyMessage(_ status: EntryStatus) -> String {
  switch status {
  case .placeholder, .noConfig:
    return "Open HKTransportAgent to see arrivals"
  case .fetchFailed:
    return "Unable to load arrivals"
  case .loaded:
    return ""
  }
}

// MARK: - Widget

struct HKTransportWidget: Widget {
  let kind: String = "HKTransportWidget"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: Provider()) { entry in
      if #available(iOS 17.0, *) {
        Group {
          WidgetFamilyView(entry: entry)
        }
        .containerBackground(.fill.tertiary, for: .widget)
      } else {
        WidgetFamilyView(entry: entry)
          .padding()
          .background()
      }
    }
    .configurationDisplayName("Transit Arrivals")
    .description("See real-time bus & transit ETAs at a glance.")
    .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
  }
}

struct WidgetFamilyView: View {
  let entry: ArrivalsEntry
  @Environment(\.widgetFamily) var family

  var body: some View {
    switch family {
    case .systemSmall:
      SmallWidgetView(entry: entry)
    case .systemMedium:
      MediumWidgetView(entry: entry)
    case .systemLarge:
      LargeWidgetView(entry: entry)
    default:
      MediumWidgetView(entry: entry)
    }
  }
}
