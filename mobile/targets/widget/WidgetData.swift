import ActivityKit
import Foundation

// MARK: - Stored config (what the app writes to UserDefaults)

struct WidgetStopConfig: Codable {
    let title: String
    let stops: [StopRef]

    struct StopRef: Codable {
        let id: String?
        let lat: Double
        let lng: Double
    }
}

// MARK: - API request / response

struct ArrivalsRequest: Encodable {
    let stops: [StopReq]

    struct StopReq: Encodable {
        let id: String?
        let lat: Double
        let lng: Double
    }
}

struct ArrivalsResponse: Decodable {
    let stops: [APIStop]?

    struct APIStop: Decodable {
        let id: String?
        let name: String
        let name_en: String?
        let name_tc: String?
        let name_sc: String?
        let lat: Double
        let lng: Double
        let arrivals: [APIArrival]?

        /// Returns the localized stop name based on system locale.
        var localizedName: String {
            let lang = Locale.current.language.languageCode?.identifier ?? "en"
            if lang == "zh" {
                // Check script: Traditional (Hant) vs Simplified (Hans)
                let script = Locale.current.language.script?.identifier
                if script == "Hans" {
                    return name_sc ?? name_tc ?? name
                }
                return name_tc ?? name_sc ?? name
            }
            return name_en ?? name
        }
    }

    struct APIArrival: Decodable {
        let route: String
        let destination: String
        let dest_tc: String?
        let dest_sc: String?
        let etas: [APIEta]?

        /// Returns the localized destination based on system locale.
        var localizedDestination: String {
            let lang = Locale.current.language.languageCode?.identifier ?? "en"
            if lang == "zh" {
                let script = Locale.current.language.script?.identifier
                if script == "Hans" {
                    return dest_sc ?? dest_tc ?? destination
                }
                return dest_tc ?? dest_sc ?? destination
            }
            return destination
        }
    }

    struct APIEta: Decodable {
        let minutes: Int
        let remarks: String?
    }
}

// MARK: - Display models (used by widget views)

struct WidgetArrivalsData {
    let title: String
    let stops: [WidgetStop]
    let updatedAt: Double
}

struct WidgetStop {
    let name: String
    let arrivals: [WidgetArrival]
}

struct WidgetArrival {
    let route: String
    let destination: String
    let etas: [WidgetEta]
}

struct WidgetEta {
    let minutes: Int
    let remarks: String
}

// MARK: - Live Activity models

struct TransitAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        var etas: [LiveEta]
        var updatedAt: Double
    }

    var route: String
    var stopName: String
    var stopId: String
    var destination: String
}

struct LiveEta: Codable, Hashable {
    let minutes: Int
    let remarks: String
}
