import ActivityKit
import Foundation

public struct TransitAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        var etas: [LiveEta]
        var updatedAt: Double
    }

    var route: String
    var stopName: String
    var stopId: String
    var destination: String
}

public struct LiveEta: Codable, Hashable {
    let minutes: Int
    let remarks: String
}
