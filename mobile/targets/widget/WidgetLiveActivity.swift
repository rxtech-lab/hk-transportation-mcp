import ActivityKit
import SwiftUI
import WidgetKit

// MARK: - Lock Screen / Banner

private struct LiveActivityBannerView: View {
  let context: ActivityViewContext<TransitAttributes>

  private var firstEta: LiveEta? { context.state.etas.first }
  private var minutes: Int { firstEta?.minutes ?? 0 }

  var body: some View {
    VStack(spacing: 0) {
      // Top row: route badge + destination + ETA
      HStack(alignment: .center, spacing: 12) {
        // Route badge with bus icon
        HStack(spacing: 6) {
          Image(systemName: "bus.fill")
            .font(.system(size: 14, weight: .semibold))
            .foregroundColor(.white.opacity(0.9))
          Text(context.attributes.route)
            .font(.system(size: 20, weight: .bold, design: .rounded))
            .foregroundColor(.white)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .background(
          RoundedRectangle(cornerRadius: 10, style: .continuous)
            .fill(Color.blue)
        )

        // Destination
        VStack(alignment: .leading, spacing: 2) {
          Text(context.attributes.stopName)
            .font(.system(size: 13, weight: .semibold))
            .foregroundColor(.white)
            .lineLimit(1)
          HStack(spacing: 4) {
            Image(systemName: "arrow.right")
              .font(.system(size: 9, weight: .bold))
              .foregroundColor(.white.opacity(0.5))
            Text(context.attributes.destination)
              .font(.system(size: 12, weight: .medium))
              .foregroundColor(.white.opacity(0.7))
              .lineLimit(1)
          }
        }

        Spacer()

        // Primary ETA
        if let eta = firstEta {
          VStack(spacing: 1) {
            Text(eta.minutes <= 0 ? "—" : "\(eta.minutes)")
              .font(.system(size: 28, weight: .bold, design: .rounded))
              .foregroundColor(etaColor(eta.minutes))
            Text(eta.minutes <= 0 ? "Left" : "min")
              .font(.system(size: 11, weight: .semibold))
              .foregroundColor(.white.opacity(0.5))
          }
        }
      }

      Spacer().frame(height: 12)

      // Progress bar
      if let eta = firstEta {
        ProgressBarView(minutes: eta.minutes)
      }

      Spacer().frame(height: 10)

      // Bottom row: next ETAs + updated time
      HStack(spacing: 0) {
        // Upcoming ETAs
        if context.state.etas.count > 1 {
          HStack(spacing: 6) {
            Image(systemName: "clock")
              .font(.system(size: 10, weight: .medium))
              .foregroundColor(.white.opacity(0.4))
            Text("Next:")
              .font(.system(size: 11, weight: .medium))
              .foregroundColor(.white.opacity(0.4))
            ForEach(Array(context.state.etas.dropFirst().prefix(2).enumerated()), id: \.offset) { idx, eta in
              if idx > 0 {
                Text("·")
                  .font(.system(size: 11))
                  .foregroundColor(.white.opacity(0.3))
              }
              Text(etaText(eta.minutes))
                .font(.system(size: 12, weight: .semibold, design: .rounded))
                .foregroundColor(etaColor(eta.minutes).opacity(0.9))
            }
          }
        }

        Spacer()

        // Updated timestamp
        HStack(spacing: 3) {
          Image(systemName: "arrow.trianglehead.2.clockwise")
            .font(.system(size: 9, weight: .medium))
            .foregroundColor(.white.opacity(0.3))
          Text(updatedText(context.state.updatedAt))
            .font(.system(size: 10, weight: .medium))
            .foregroundColor(.white.opacity(0.3))
        }
      }
    }
    .padding(.horizontal, 20)
    .padding(.vertical, 14)
  }
}

// MARK: - Progress Bar

private struct ProgressBarView: View {
  let minutes: Int

  // Map minutes to progress: 0min = 1.0, 15+min = ~0.05
  private var progress: Double {
    if minutes <= 0 { return 1.0 }
    if minutes >= 15 { return 0.05 }
    return 1.0 - (Double(minutes) / 15.0) * 0.95
  }

  private var barColor: Color {
    if minutes <= 0 { return Color(red: 1.0, green: 0.271, blue: 0.227) }
    if minutes <= 3 { return Color(red: 0.188, green: 0.820, blue: 0.345) }
    if minutes <= 8 { return Color(red: 1.0, green: 0.839, blue: 0.039) }
    return Color.blue
  }

  var body: some View {
    GeometryReader { geo in
      ZStack(alignment: .leading) {
        // Track
        RoundedRectangle(cornerRadius: 3, style: .continuous)
          .fill(Color.white.opacity(0.1))
          .frame(height: 5)

        // Fill
        RoundedRectangle(cornerRadius: 3, style: .continuous)
          .fill(
            LinearGradient(
              colors: [barColor.opacity(0.6), barColor],
              startPoint: .leading,
              endPoint: .trailing
            )
          )
          .frame(width: max(geo.size.width * progress, 6), height: 5)

        // Bus indicator dot at the leading edge of progress
        Circle()
          .fill(barColor)
          .frame(width: 9, height: 9)
          .shadow(color: barColor.opacity(0.5), radius: 3, x: 0, y: 0)
          .offset(x: max(geo.size.width * progress - 4.5, 0))
      }
    }
    .frame(height: 9)
  }
}

// MARK: - Dynamic Island

struct WidgetLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: TransitAttributes.self) { context in
      LiveActivityBannerView(context: context)
    } dynamicIsland: { context in
      DynamicIsland {
        // Expanded
        DynamicIslandExpandedRegion(.leading) {
          HStack(spacing: 6) {
            Image(systemName: "bus.fill")
              .font(.system(size: 13, weight: .semibold))
              .foregroundColor(.blue)
            Text(context.attributes.route)
              .font(.system(size: 20, weight: .bold, design: .rounded))
              .foregroundColor(.white)
          }
        }

        DynamicIslandExpandedRegion(.trailing) {
          if let first = context.state.etas.first {
            HStack(alignment: .firstTextBaseline, spacing: 2) {
              Text(first.minutes <= 0 ? "—" : "\(first.minutes)")
                .font(.system(size: 24, weight: .bold, design: .rounded))
                .foregroundColor(etaColor(first.minutes))
              if first.minutes > 0 {
                Text("min")
                  .font(.system(size: 11, weight: .semibold))
                  .foregroundColor(.white.opacity(0.5))
              }
            }
          }
        }

        DynamicIslandExpandedRegion(.center) {
          EmptyView()
        }

        DynamicIslandExpandedRegion(.bottom) {
          VStack(spacing: 8) {
            // Stop info
            HStack(spacing: 4) {
              Image(systemName: "mappin.circle.fill")
                .font(.system(size: 11))
                .foregroundColor(.white.opacity(0.5))
              Text(context.attributes.stopName)
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(.white.opacity(0.8))
              Image(systemName: "arrow.right")
                .font(.system(size: 9, weight: .bold))
                .foregroundColor(.white.opacity(0.4))
              Text(context.attributes.destination)
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(.white.opacity(0.6))
              Spacer()
            }

            // Progress bar
            if let first = context.state.etas.first {
              ProgressBarView(minutes: first.minutes)
            }

            // Next ETAs
            if context.state.etas.count > 1 {
              HStack(spacing: 6) {
                Text("Next")
                  .font(.system(size: 11, weight: .medium))
                  .foregroundColor(.white.opacity(0.4))
                ForEach(Array(context.state.etas.dropFirst().prefix(2).enumerated()), id: \.offset) { idx, eta in
                  if idx > 0 {
                    Text("·")
                      .font(.system(size: 11))
                      .foregroundColor(.white.opacity(0.3))
                  }
                  Text(etaText(eta.minutes))
                    .font(.system(size: 12, weight: .semibold, design: .rounded))
                    .foregroundColor(etaColor(eta.minutes))
                }
                Spacer()
              }
            }
          }
        }
      } compactLeading: {
        HStack(spacing: 4) {
          Image(systemName: "bus.fill")
            .font(.system(size: 10))
            .foregroundColor(.blue)
          Text(context.attributes.route)
            .font(.system(size: 13, weight: .bold, design: .rounded))
            .foregroundColor(.white)
        }
      } compactTrailing: {
        if let first = context.state.etas.first {
          Text(etaText(first.minutes))
            .font(.system(size: 13, weight: .bold, design: .rounded))
            .foregroundColor(etaColor(first.minutes))
        }
      } minimal: {
        Image(systemName: "bus.fill")
          .font(.system(size: 11, weight: .semibold))
          .foregroundColor(.blue)
      }
    }
  }
}

// MARK: - Helpers

private func updatedText(_ timestamp: Double) -> String {
  let seconds = Int(Date().timeIntervalSince1970 - timestamp)
  if seconds < 10 { return "Just now" }
  if seconds < 60 { return "\(seconds)s ago" }
  let mins = seconds / 60
  return "\(mins)m ago"
}
