import SwiftUI

struct FuelComposer: View {
  let position: Double
  let plan: FuelPlan
  let theme: RideTheme
  let haptics: Bool
  let onSave: (FuelStop) -> Void
  let onCancel: () -> Void
  @State private var draft = FuelStop(reminder: FuelKind.water.defaultReminder, kind: .water)
  @State private var reminderWasEdited = false
  @State private var iconEvent = UUID()
  @FocusState private var focused: Field?

  private enum Field { case name, reminder }

  private var candidate: FuelStop {
    var stop = draft
    stop.distance = PlanDistance.stored(position)
    stop.name = stop.name.trimmingCharacters(in: .whitespacesAndNewlines)
    return stop
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
          HStack(spacing: 24) {
            FuelToken(kind: draft.kind, theme: theme, arrivalEvent: iconEvent)
              .scaleEffect(2.1).frame(width: 74, height: 112)
              .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 12) {
              if draft.kind == .custom {
                VStack(alignment: .leading, spacing: 5) {
                  Text("补给名称").font(.caption).foregroundStyle(theme.muted)
                  TextField("例如巧克力", text: $draft.name)
                    .font(.system(.title2, design: theme.fontDesign).weight(.semibold))
                    .focused($focused, equals: .name)
                    .accessibilityLabel("自定义补给名称")
                }
              }
              VStack(alignment: .leading, spacing: 6) {
                Text("手表提示").font(.caption).foregroundStyle(theme.muted)
                TextField(
                  "填写到点提醒",
                  text: Binding(
                    get: { draft.reminder },
                    set: {
                      if $0 != draft.reminder { reminderWasEdited = true }
                      draft.reminder = $0
                    }), axis: .vertical
                )
                .font(
                  .system(draft.kind == .custom ? .title3 : .title, design: theme.fontDesign)
                    .weight(.semibold)
                )
                .lineLimit(1...3).focused($focused, equals: .reminder)
                .accessibilityLabel("新增到点提醒")
              }
              Rectangle().fill(theme.line).frame(height: 1)
            }.frame(maxWidth: .infinity, alignment: .leading)
          }
          HStack(spacing: 8) {
            ForEach(FuelKind.allCases) { kind in
              typeButton(kind)
            }
          }
          if let validation, !draft.reminder.isEmpty {
            Text(validation).font(.caption).foregroundStyle(theme.detail)
          }
        }.padding(.horizontal, 24).padding(.top, 18).padding(.bottom, 24)
      }
      .scrollDismissesKeyboard(.interactively)
      .background(theme.surface)
      .safeAreaInset(edge: .top, spacing: 0) { header }
      .toolbar(.hidden, for: .navigationBar)
      .toolbar {
        ToolbarItemGroup(placement: .keyboard) {
          Spacer()
          Button("完成") { focused = nil }
        }
      }
    }
    .foregroundStyle(theme.ink).tint(Color(uiColor: theme.rulerFocus))
    .sensoryFeedback(.selection, trigger: draft.kind) { _, _ in haptics }
    .onChange(of: draft.kind) { _, kind in
      if !reminderWasEdited { draft.reminder = kind.defaultReminder }
      iconEvent = UUID()
      focused = kind == .custom ? .name : nil
    }
  }

  private var header: some View {
    HStack(spacing: 8) {
      Button {
        focused = nil
        onCancel()
      } label: {
        Image(systemName: "xmark").frame(width: 56, height: 44)
      }.accessibilityLabel("取消新增补给")
      Spacer(minLength: 0)
      Text(rideDistance(position)).font(.headline).monospacedDigit()
        .foregroundStyle(Color(uiColor: theme.rulerFocus))
        .accessibilityLabel("新增补给位置，\(rideDistance(position))")
      Spacer(minLength: 0)
      Button("添加") {
        guard validation == nil else { return }
        focused = nil
        onSave(candidate)
      }.fontWeight(.semibold).frame(minWidth: 56, minHeight: 44)
        .foregroundStyle(validation == nil ? Color(uiColor: theme.rulerFocus) : theme.muted)
        .disabled(validation != nil).accessibilityLabel("添加到计划")
    }.buttonStyle(.plain).padding(.horizontal, 12).padding(.top, 10)
      .background(theme.surface)
  }

  private func typeButton(_ kind: FuelKind) -> some View {
    let selected = draft.kind == kind
    return Button {
      draft.kind = kind
    } label: {
      VStack(spacing: 5) {
        FuelToken(kind: kind, theme: theme).scaleEffect(0.65).frame(width: 28, height: 32)
          .accessibilityHidden(true)
        Text(kind == .gel ? "胶" : kind.title).font(.caption.weight(selected ? .bold : .medium))
      }
      .frame(maxWidth: .infinity).padding(.vertical, 9)
      .foregroundStyle(selected ? Color(uiColor: theme.rulerFocus) : theme.ink)
      .background(
        selected ? Color(uiColor: theme.rulerFocus).opacity(0.1) : .clear,
        in: RoundedRectangle(cornerRadius: 16)
      )
      .overlay {
        RoundedRectangle(cornerRadius: 16)
          .stroke(selected ? Color(uiColor: theme.rulerFocus) : .clear, lineWidth: 1)
      }
    }.buttonStyle(.plain).accessibilityLabel("选择\(kind.title)")
      .accessibilityAddTraits(selected ? .isSelected : [])
  }
}
