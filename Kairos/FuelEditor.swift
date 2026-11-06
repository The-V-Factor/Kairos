import SwiftUI

struct FuelEditor: View {
  @State var segment: FuelStop
  let plan: FuelPlan
  let theme: RideTheme
  let haptics: Bool
  let canDelete: Bool
  let onSave: (FuelStop) -> Void
  let onDelete: () -> Void
  @State private var kilometers = false
  @State private var input = ""
  @FocusState private var focused: Bool
  @Environment(\.dismiss) private var dismiss

  private var unitSelection: Binding<Bool> {
    Binding(
      get: { kilometers },
      set: { value in
        let previous = meters
        kilometers = value
        if let previous { input = distanceNumber(previous / (value ? 1000 : 1)) }
      })
  }

  private var meters: Double? {
    let normalized = input.trimmingCharacters(in: .whitespacesAndNewlines)
      .replacingOccurrences(of: Locale.current.decimalSeparator ?? ".", with: ".")
    guard !normalized.isEmpty, normalized.allSatisfy({ "0123456789.".contains($0) }),
      let number = Double(normalized), number.isFinite
    else { return nil }
    let result = number * (kilometers ? 1000 : 1)
    return result.isFinite ? result : nil
  }
  private var candidate: FuelStop {
    var value = segment
    value.distance = meters.map(PlanDistance.stored) ?? ""
    value.name = value.name.trimmingCharacters(in: .whitespacesAndNewlines)
    value.legacyDistance = nil
    return value
  }
  private var validation: String? {
    do {
      try plan.validateStop(candidate)
      return nil
    } catch { return error.localizedDescription.replacingOccurrences(of: "第 1 个补给点：", with: "") }
  }

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: 24) {
          HStack(spacing: 14) {
            FuelToken(kind: segment.kind, theme: theme)
            Text("编辑补给点").font(.system(.title2, design: theme.fontDesign).weight(.bold))
          }
          VStack(alignment: .leading, spacing: 12) {
            Text("距出发里程").font(.subheadline.weight(.semibold))
            HStack(alignment: .firstTextBaseline, spacing: 20) {
              TextField("0", text: $input)
                .font(.system(.largeTitle, design: theme.fontDesign).weight(.semibold))
                .monospacedDigit().keyboardType(.decimalPad).focused($focused)
                .accessibilityLabel("距出发里程")
              Picker("距离单位", selection: unitSelection) {
                Text("m").tag(false)
                Text("km").tag(true)
              }
              .pickerStyle(.segmented).frame(width: 116)
            }
            DistanceRuler(
              theme: theme, haptics: haptics,
              totalMeters: FuelPlan.meters(plan.totalDistance) ?? 1, editValue: meters ?? 0,
              onEdit: { value in
                focused = false
                input = distanceNumber(value / (kilometers ? 1000 : 1))
              }
            ).frame(height: 100)
            Text(
              "在 \(FuelPlan.meters(plan.totalDistance).map(rideDistance) ?? "计划距离") 内选择位置，双指缩放。其他补给点保持原位。"
            )
            .font(.caption).foregroundStyle(theme.muted)
            if let original = segment.legacyDistance {
              Text("旧计划中本段原始距离为“\(original)”米，无法确定累计位置，请重新填写距出发里程。")
                .font(.footnote).foregroundStyle(theme.detail)
            }
          }
          VStack(alignment: .leading, spacing: 12) {
            Text("补给类型").font(.subheadline.weight(.semibold))
            Picker("补给类型", selection: $segment.kind) {
              ForEach(FuelKind.allCases) { kind in Text(kind.title).tag(kind) }
            }.pickerStyle(.segmented)
              .onChange(of: segment.kind) { _, kind in
                guard segment.reminder.isEmpty else { return }
                segment.reminder = kind.defaultReminder
              }
            if segment.kind == .custom {
              TextField("输入补给名称，例如香蕉、盐丸", text: $segment.name)
                .padding(16)
                .background(theme.ink.opacity(0.05), in: RoundedRectangle(cornerRadius: 12))
                .accessibilityLabel("自定义补给名称")
            }
          }
          VStack(alignment: .leading, spacing: 12) {
            Text("到点提醒").font(.subheadline.weight(.semibold))
            TextField("输入手表上要显示的文字", text: $segment.reminder, axis: .vertical)
              .lineLimit(1...5).padding(16)
              .background(theme.ink.opacity(0.05), in: RoundedRectangle(cornerRadius: 12))
              .accessibilityLabel("到点提醒")
            if let meters {
              Text("骑到 \(rideDistance(meters)) 时提醒")
                .font(.footnote).foregroundStyle(theme.muted)
            }
          }
          if let validation { Text(validation).font(.footnote).foregroundStyle(theme.detail) }
          Button {
            onSave(candidate)
            dismiss()
          } label: {
            Text("保存补给点").font(.headline).frame(maxWidth: .infinity).padding(18)
              .foregroundStyle(theme.onAccent)
              .background(
                theme.accent.opacity(validation == nil ? 1 : 0.35),
                in: RoundedRectangle(cornerRadius: theme.radius))
          }.buttonStyle(.plain).disabled(validation != nil)
          if canDelete {
            Button(role: .destructive) {
              onDelete()
              dismiss()
            } label: {
              Label("删除补给点", systemImage: "trash").frame(maxWidth: .infinity).padding(12)
            }
          }
        }.padding(24)
      }
      .scrollDismissesKeyboard(.interactively)
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
        let value = Double(
          segment.distance.replacingOccurrences(
            of: Locale.current.decimalSeparator ?? ".", with: "."))
        kilometers = (value ?? 0) >= 1000
        input = value.map { distanceNumber($0 / (kilometers ? 1000 : 1)) } ?? segment.distance
      }
    }.presentationDetents([.large]).presentationDragIndicator(.visible)
  }
}
