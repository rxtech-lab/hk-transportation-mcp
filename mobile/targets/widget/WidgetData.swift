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
        let lat: Double
        let lng: Double
        let arrivals: [APIArrival]?
    }

    struct APIArrival: Decodable {
        let route: String
        let destination: String
        let etas: [APIEta]?
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
