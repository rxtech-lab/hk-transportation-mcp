import SwiftUI
import WidgetKit

@main
struct HKTransportWidgetBundle: WidgetBundle {
  var body: some Widget {
    HKTransportWidget()
    WidgetLiveActivity()
  }
}
