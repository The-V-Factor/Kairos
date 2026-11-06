import SwiftUI

struct PlanDistanceEditor: View {
  let plan: FuelPlan
  let theme: RideTheme
  let onSave: (String) -> Void
  @State private var input = ""
  @State private var kilometers = true
  @FocusState private var focused: Bool
  @Environment(\.dismiss) private var dismiss

  private var meters: Double? {
    guard let number = FuelPlan.meters(input) else { return nil }
    let value = number * (kilometers ? 1000 : 1)
    let rounded = PlanDistance.roundedMeters(value)
    return rounded.isFinite && rounded > 0 ? rounded : nil
  }
  private var validation: String? {
    guard let meters else { return "请输入大于 0 的计划距离。" }
    if let last = plan.stops.compactMap({
      FuelPlan.meters($0.distance, allowZero: true).map(PlanDistance.roundedMeters)
    }).max(),
      last > meters
    {
      return "最远补给点在 \(rideDistance(last))。请先调整该点，或设置更长的计划距离。"
    }
    return nil
  }

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: 24) {
          Text("这次，骑多远？")
            .font(.system(.title, design: theme.fontDesign).weight(.bold))
          Text("先定计划距离，再安排沿途的补给。修改总距离不会移动已有补给点。")
            .font(.subheadline).foregroundStyle(theme.muted)
          HStack(spacing: 20) {
            TextField("例如 80", text: $input)
              .font(.system(.largeTitle, design: theme.fontDesign).weight(.semibold))
              .monospacedDigit().keyboardType(.decimalPad).focused($focused)
              .accessibilityLabel("计划距离")
            Picker(
              "距离单位",
              selection: Binding(
                get: { kilometers },
                set: { value in
                  let previous = meters
                  kilometers = value
                  if let previous { input = distanceNumber(previous / (value ? 1000 : 1)) }
                })
            ) {
              Text("m").tag(false)
              Text("km").tag(true)
            }.pickerStyle(.segmented).frame(width: 116)
          }
          if let validation { Text(validation).font(.footnote).foregroundStyle(theme.detail) }
          Button {
            guard let meters, validation == nil else { return }
            onSave(PlanDistance.stored(meters))
            dismiss()
          } label: {
            Text("保存计划距离").font(.headline).frame(maxWidth: .infinity).padding(18)
              .foregroundStyle(theme.onAccent)
              .background(
                theme.accent.opacity(validation == nil ? 1 : 0.35),
                in: RoundedRectangle(cornerRadius: theme.radius))
          }.buttonStyle(.plain).disabled(validation != nil)
          Text("计划距离用于安排补给，骑行记录仍由你在手表上手动结束。")
            .font(.caption).foregroundStyle(theme.muted)
        }.padding(24)
      }.scrollDismissesKeyboard(.interactively)
        .foregroundStyle(theme.ink).background(theme.canvas)
        .toolbar {
          ToolbarItem(placement: .cancellationAction) { Button("取消") { dismiss() } }
          ToolbarItemGroup(placement: .keyboard) {
            Spacer()
            Button("完成") { focused = false }
          }
        }
        .toolbarBackground(theme.canvas, for: .navigationBar).tint(theme.accent)
        .onAppear {
          if let meters = FuelPlan.meters(plan.totalDistance) {
            kilometers = meters >= 1000
            input = distanceNumber(meters / (kilometers ? 1000 : 1))
          }
        }
    }.presentationDetents([.large]).presentationDragIndicator(.visible)
  }
}
