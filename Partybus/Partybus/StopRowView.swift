import SwiftUI

struct StopRowView: View {
    @Binding var stop: PlannedStop
    let index: Int
    let budget: Double
    let allStops: [PlannedStop]
    let onFocus: () -> Void

    private var usedAfterThisStop: Double {
        allStops.prefix(index + 1).reduce(0) { $0 + $1.lineTotalMinutes }
    }

    private var remainingAfterThisStop: Double {
        max(0, budget - usedAfterThisStop)
    }

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Button(action: onFocus) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("\(stop.listOrder). \(stop.name)")
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(.primary)
                        .multilineTextAlignment(.leading)
                    Text("Detour ≈ \(Int(round(stop.detourMinutes))) min · dwell \(Int(stop.dwellMinutes)) min")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                    Text("After this stop: \(Int(round(remainingAfterThisStop))) min left in budget")
                        .font(.caption2.monospacedDigit())
                        .foregroundStyle(remainingAfterThisStop <= 0 ? .red : .secondary)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            Stepper(value: $stop.dwellMinutes, in: 0...240, step: 5) {
                Text("\(Int(stop.dwellMinutes)) min")
                    .font(.caption.monospacedDigit())
            }
            .fixedSize()
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
        .accessibilityHint("Tap the stop name to focus it on the map.")
    }
}
