import ExpoModulesCore
import ActivityKit

final class ActivityUnavailableException: GenericException<Void> {
  override var reason: String { "Live activities are not available on this system." }
}

final class ActivityDataException: GenericException<String> {
  override var reason: String { "Failed to parse Live Activity data: \(param)" }
}

fileprivate struct StartParams: Decodable {
  let route: String
  let stopName: String
  let stopId: String
  let destination: String
  let etas: [LiveEta]
}

fileprivate struct UpdateParams: Decodable {
  let etas: [LiveEta]
}

public class LiveActivityModule: Module {
  public func definition() -> ModuleDefinition {
    Name("LiveActivity")

    Property("areLiveActivitiesEnabled") {
      if #available(iOS 16.2, *) {
        return ActivityAuthorizationInfo().areActivitiesEnabled
      }
      return false
    }

    AsyncFunction("startLiveActivity") { (rawData: String) async throws -> Void in
      guard #available(iOS 16.2, *) else {
        throw ActivityUnavailableException(())
      }

      let data = Data(rawData.utf8)
      let params: StartParams
      do {
        params = try JSONDecoder().decode(StartParams.self, from: data)
      } catch {
        throw ActivityDataException(rawData)
      }

      // End any existing activity first
      for activity in Activity<TransitAttributes>.activities {
        await activity.end(dismissalPolicy: .immediate)
      }

      guard ActivityAuthorizationInfo().areActivitiesEnabled else {
        throw ActivityUnavailableException(())
      }

      let attrs = TransitAttributes(
        route: params.route,
        stopName: params.stopName,
        stopId: params.stopId,
        destination: params.destination
      )
      let state = TransitAttributes.ContentState(
        etas: params.etas,
        updatedAt: Date().timeIntervalSince1970
      )

      _ = try Activity<TransitAttributes>.request(
        attributes: attrs,
        contentState: state,
        pushType: nil
      )
    }

    AsyncFunction("updateLiveActivity") { (rawData: String) async throws -> Void in
      guard #available(iOS 16.2, *) else {
        throw ActivityUnavailableException(())
      }
      guard let activity = Activity<TransitAttributes>.activities.first else {
        throw ActivityUnavailableException(())
      }

      let data = Data(rawData.utf8)
      let params: UpdateParams
      do {
        params = try JSONDecoder().decode(UpdateParams.self, from: data)
      } catch {
        throw ActivityDataException(rawData)
      }

      let state = TransitAttributes.ContentState(
        etas: params.etas,
        updatedAt: Date().timeIntervalSince1970
      )
      await activity.update(using: state)
    }

    AsyncFunction("stopLiveActivity") { () async throws -> Void in
      guard #available(iOS 16.2, *) else {
        throw ActivityUnavailableException(())
      }
      for activity in Activity<TransitAttributes>.activities {
        await activity.end(dismissalPolicy: .immediate)
      }
    }

    Function("isLiveActivityRunning") { () -> Bool in
      if #available(iOS 16.2, *) {
        return !Activity<TransitAttributes>.activities.isEmpty
      }
      return false
    }
  }
}
