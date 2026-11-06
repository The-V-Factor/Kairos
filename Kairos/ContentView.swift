import SwiftUI

struct ContentView: View {
  @State private var store = PlanStore()
  @AppStorage("kairos.appearance.v1") private var themeName = RideTheme.trail.rawValue
  @AppStorage("kairos.haptics.v1") private var haptics = true
  @State private var showingThemes = false
  @State private var showingHelp = false
  @State private var showingDistance = false
  @State private var showingHistory = false
  @State private var editingSegment: FuelStop?
  @State private var selectedID: UUID?
  @State private var arrivingID: UUID?
  @State private var arrivalEvent: UUID?
  @State private var removingIDs: Set<UUID> = []
  @State private var deleted: DeletedPoint?
  @State private var rulerIdentity = UUID()
  @State private var rulerZoomCommand = 0
  @State private var pendingDelete: UUID?
  @State private var pendingSave: FuelStop?
  @State private var isAdding = false
  @State private var addingAt = 0.0
  @State private var cursorMeters = 0.0
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  private struct DeletedPoint {
    var segment: FuelStop
    var index: Int
  }
  private var theme: RideTheme { RideTheme(rawValue: themeName) ?? .trail }
  private var themeBinding: Binding<RideTheme> {
    Binding(get: { theme }, set: { themeName = $0.rawValue })
  }
  private var plannedMeters: Double? {
    guard let meters = FuelPlan.meters(store.plan.totalDistance) else { return nil }
    let rounded = PlanDistance.roundedMeters(meters)
    return rounded.isFinite && rounded > 0 ? rounded : nil
  }
  private var points: [FuelPoint] {
    store.plan.orderedStops.compactMap { stop in
      guard let meters = FuelPlan.meters(stop.distance, allowZero: true) else { return nil }
      return FuelPoint(
        id: stop.id, cumulativeMeters: PlanDistance.roundedMeters(meters), reminder: stop.reminder,
        kind: stop.kind)
    }
  }
  private var canSend: Bool {
    store.validationMessage == nil && removingIDs.isEmpty && pendingDelete == nil
      && pendingSave == nil && !isAdding && !store.isWorking
  }
  private var motion: Animation? { reduceMotion ? .easeOut(duration: 0.1) : theme.motion }

  var body: some View {
    NavigationStack {
      ScrollViewReader { proxy in
        List {
          overview.padding(.top, 10).padding(.bottom, 16)
            .listRowInsets(EdgeInsets(top: 0, leading: 24, bottom: 0, trailing: 24))
            .listRowSeparator(.hidden).listRowBackground(theme.canvas)
          if let plannedMeters {
            VStack(spacing: 4) {
              DistanceRuler(
                points: points, selectedID: selectedID, theme: theme, haptics: haptics,
                totalMeters: plannedMeters,
                zoomCommand: rulerZoomCommand,
                onSelect: { id in
                  selectedID = id
                  if !isAdding {
                    withAnimation(motion) { proxy.scrollTo(id, anchor: .center) }
                  }
                },
                onBrowse: { cursorMeters = $0 }
              ).frame(height: 124).id(rulerIdentity)
                .overlay(alignment: .topTrailing) {
                  Button {
                    addingAt = cursorMeters
                    isAdding = true
                  } label: {
                    Label("补给", systemImage: "plus").font(.caption.weight(.semibold))
                      .foregroundStyle(theme.accent)
                      .padding(.horizontal, 10).padding(.vertical, 7)
                      .background(theme.ink.opacity(0.05), in: Capsule())
                      .frame(minHeight: 44)
                  }.buttonStyle(.plain).accessibilityLabel("在当前里程添加补给")
                    .accessibilityIdentifier("addSegment")
                    .disabled(isAdding || store.isSending || !removingIDs.isEmpty)
                    .offset(y: -12)
                }
              HStack {
                Text("累计距离 · 双指缩放")
                Spacer()
                Button {
                  rulerZoomCommand -= 1
                } label: {
                  Image(systemName: "minus.magnifyingglass").frame(width: 36, height: 32)
                }
                .accessibilityLabel("缩小距离尺")
                Button {
                  rulerZoomCommand += 1
                } label: {
                  Image(systemName: "plus.magnifyingglass").frame(width: 36, height: 32)
                }
                .accessibilityLabel("放大距离尺")
                Button("全览") {
                  selectedID = nil
                  cursorMeters = plannedMeters / 2
                  rulerIdentity = UUID()
                }
              }.font(.caption2).foregroundStyle(theme.muted).buttonStyle(.plain)
            }.padding(.bottom, 16).id("ruler")
              .listRowInsets(EdgeInsets(top: 0, leading: 24, bottom: 0, trailing: 24))
              .listRowSeparator(.hidden).listRowBackground(theme.canvas)
          }
          itinerary
          Label("骑至计划终点后，可继续骑行。", systemImage: "infinity")
            .font(.footnote).foregroundStyle(theme.muted)
            .padding(.top, 16).padding(.bottom, 24)
            .listRowInsets(EdgeInsets(top: 0, leading: 24, bottom: 0, trailing: 24))
            .listRowSeparator(.hidden).listRowBackground(theme.canvas)
        }
        .listStyle(.plain).scrollContentBackground(.hidden)
        .environment(\.defaultMinListRowHeight, 0)
        .frame(maxWidth: 600).frame(maxWidth: .infinity)
        .scrollDismissesKeyboard(.interactively)
      }
      .background(theme.canvas)
      .safeAreaInset(edge: .top, spacing: 0) { masthead }
      .safeAreaInset(edge: .bottom, spacing: 0) { sendDock }
      .toolbar(.hidden, for: .navigationBar)
      .sheet(isPresented: $showingThemes) { ThemePicker(selected: themeBinding, haptics: $haptics) }
      .sheet(isPresented: $showingHelp) { help }
      .sheet(isPresented: $showingHistory) { PlanHistoryView(store: store, theme: theme) }
      .sheet(isPresented: $showingDistance) {
        PlanDistanceEditor(plan: store.plan, theme: theme) { distance in
          store.plan.totalDistance = distance
        }
      }
      .sheet(
        isPresented: $isAdding,
        onDismiss: {
          if let stop = pendingSave {
            pendingSave = nil
            save(stop)
          }
        }
      ) {
        FuelComposer(position: addingAt, plan: store.plan, theme: theme, haptics: haptics) { stop in
          pendingSave = stop
          isAdding = false
        } onCancel: {
          isAdding = false
        }
        .presentationDetents([.height(360), .large])
        .presentationDragIndicator(.visible)
        .presentationCornerRadius(28)
        .presentationBackground(theme.surface)
      }
      .sheet(
        item: $editingSegment,
        onDismiss: {
          if let segment = pendingSave {
            pendingSave = nil
            save(segment)
          }
          if let id = pendingDelete {
            pendingDelete = nil
            remove(id)
          }
        }
      ) { segment in
        FuelEditor(
          segment: segment, plan: store.plan, theme: theme,
          haptics: haptics, canDelete: store.plan.stops.contains(where: { $0.id == segment.id }),
          onSave: { pendingSave = $0 }, onDelete: { pendingDelete = segment.id })
      }
      .tint(theme.accent).foregroundStyle(theme.ink)
      .preferredColorScheme(theme == .rhythm ? .dark : .light)
      .sensoryFeedback(.selection, trigger: themeName) { _, _ in haptics }
      .sensoryFeedback(.impact(weight: .light), trigger: arrivalEvent) { _, _ in haptics }
      .onAppear { cursorMeters = plannedMeters.map { $0 / 2 } ?? 0 }
      .onChange(of: plannedMeters) { old, value in
        if let value {
          cursorMeters = old == nil ? value / 2 : min(cursorMeters, value)
        }
      }
    }
  }

  private var masthead: some View {
    HStack {
      Text("KAIROS").font(.system(.caption, design: theme.fontDesign).weight(.black)).tracking(3)
      Spacer()
      Button {
        showingThemes = true
      } label: {
        Label(theme.title, systemImage: "swatchpalette").font(.caption.weight(.semibold))
          .padding(.horizontal, 12).frame(minHeight: 44)
          .background(theme.ink.opacity(0.05), in: Capsule())
      }.accessibilityLabel("选择皮肤，当前\(theme.title)")
      Button {
        showingHistory = true
      } label: {
        Image(systemName: "clock.arrow.circlepath").frame(width: 44, height: 44)
      }.accessibilityLabel("历史计划")
      Button {
        showingHelp = true
      } label: {
        Image(systemName: "questionmark.circle").frame(width: 44, height: 44)
      }
      .accessibilityLabel("使用说明")
    }.buttonStyle(.plain).padding(.horizontal, 24).padding(.vertical, 6)
      .frame(maxWidth: 600).frame(maxWidth: .infinity).background(theme.canvas)
  }

  private var overview: some View {
    VStack(alignment: .leading, spacing: 12) {
      if theme == .rhythm {
        HStack {
          Text("READY TO RIDE").font(.system(size: 10, weight: .medium)).tracking(3)
          Rectangle().fill(theme.line).frame(height: 1)
        }
      }
      ViewThatFits(in: .horizontal) {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
          heading.fixedSize()
          Spacer(minLength: 0)
          plannedDistance.fixedSize()
        }
        VStack(alignment: .leading, spacing: 0) {
          heading
          plannedDistance
        }
      }
      DatePicker("骑行日期", selection: $store.rideDate, displayedComponents: .date)
        .font(.footnote).foregroundStyle(theme.muted).disabled(store.isWorking)
      if plannedMeters == nil && !store.plan.stops.isEmpty {
        Text("原有补给已按距出发里程保留，请先确认这次骑行的计划距离。")
          .font(.footnote).foregroundStyle(theme.muted)
      }
      if theme == .trail { TrailArtwork(theme: theme) }
      if theme == .pocket {
        HStack(spacing: 36) {
          ForEach(Array(store.plan.orderedStops.prefix(3).enumerated()), id: \.element.id) {
            index, segment in
            VStack(spacing: 10) {
              FuelToken(kind: segment.kind, theme: theme).scaleEffect(1.35)
                .frame(height: 56).rotationEffect(.degrees(index == 1 ? 8 : -8))
              Text("\(index + 1)").font(.caption.weight(.black))
            }
          }
        }.frame(maxWidth: .infinity).padding(.top, 6)
      }
    }
  }

  private var heading: some View {
    Text(theme == .journal ? "补给路书" : "骑行补给")
      .font(
        .system(.largeTitle, design: theme.fontDesign).weight(
          theme == .journal ? .semibold : .bold)
      )
      .fontWidth(theme == .rhythm ? .condensed : .standard).accessibilityAddTraits(.isHeader)
      .overlay(alignment: .leading) {
        if theme == .journal { Rectangle().fill(theme.accent).frame(width: 3).offset(x: -12) }
      }
  }

  private var plannedDistance: some View {
    Button {
      showingDistance = true
    } label: {
      HStack(alignment: .firstTextBaseline, spacing: 5) {
        Text("全程").font(.caption).foregroundStyle(theme.muted)
        Text(plannedMeters.map(rideDistance) ?? "设置距离")
          .font(.system(.headline, design: theme.fontDesign).weight(.bold)).monospacedDigit()
          .foregroundStyle(Color(uiColor: theme.rulerFocus))
        Image(systemName: "pencil").font(.caption).foregroundStyle(theme.muted)
      }.frame(minHeight: 44)
    }.buttonStyle(.plain).disabled(isAdding || store.isSending || !removingIDs.isEmpty)
      .accessibilityLabel("计划距离，\(plannedMeters.map(rideDistance) ?? "未设置")，点按修改")
      .accessibilityIdentifier("editPlanDistance")
  }

  @ViewBuilder private var itinerary: some View {
    if store.plan.stops.isEmpty {
      VStack(alignment: .leading, spacing: 8) {
        Text("从第一站开始。").font(.title3.weight(.semibold))
        Text("先设置计划距离，再安排沿途的补给点。").font(.subheadline).foregroundStyle(theme.muted)
      }.frame(maxWidth: .infinity, alignment: .leading).padding(.vertical, 24)
        .listRowInsets(EdgeInsets(top: 0, leading: 24, bottom: 0, trailing: 24))
        .listRowSeparator(.hidden).listRowBackground(theme.canvas)
    }
    ForEach(Array(store.plan.orderedStops.enumerated()), id: \.element.id) { index, segment in
      pointRow(segment, index: index).id(segment.id)
        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
          Button {
            remove(segment.id)
          } label: {
            Label("删除", systemImage: "trash")
          }.tint(.red).disabled(store.isSending || removingIDs.contains(segment.id))
            .accessibilityLabel("删除\(segment.displayName)补给点")
        }
        .listRowInsets(
          EdgeInsets(
            top: theme == .trail || theme == .pocket ? 5 : 0, leading: 24,
            bottom: theme == .trail || theme == .pocket ? 5 : 0, trailing: 24)
        )
        .listRowSeparator(.hidden).listRowBackground(theme.canvas)
    }
  }

  private func pointRow(_ segment: FuelStop, index: Int) -> some View {
    let point = points.first(where: { $0.id == segment.id })
    let removing = removingIDs.contains(segment.id)
    return Button {
      selectedID = segment.id
      editingSegment = segment
    } label: {
      HStack(spacing: 14) {
        VStack(spacing: 6) {
          Text(String(format: "%02d", index + 1)).font(.caption2.weight(.bold).monospacedDigit())
            .foregroundStyle(theme.detail)
          FuelToken(
            kind: segment.kind, theme: theme, removing: removing,
            arrivalEvent: arrivingID == segment.id ? arrivalEvent : nil
          )
        }
        VStack(alignment: .leading, spacing: 5) {
          Text(point.map { rideDistance($0.cumulativeMeters) } ?? "填写距离")
            .font(
              .system(theme == .journal ? .title : .title2, design: theme.fontDesign).weight(
                .semibold)
            )
            .foregroundStyle(theme.accent).monospacedDigit()
          Text(segment.reminder.isEmpty ? "未完成的补给点" : segment.reminder)
            .font(.subheadline.weight(.semibold)).fixedSize(horizontal: false, vertical: true)
          Text("\(segment.displayName) · 距出发里程").font(.caption2).foregroundStyle(theme.muted)
        }
        Spacer(minLength: 0)
        Image(systemName: "chevron.right").font(.caption.weight(.medium)).foregroundStyle(
          theme.muted)
      }
      .padding(.vertical, 10).padding(.horizontal, theme == .trail || theme == .pocket ? 14 : 0)
      .frame(maxWidth: .infinity, alignment: .leading)
      .background {
        if theme == .trail || theme == .pocket {
          RoundedRectangle(cornerRadius: theme.radius).fill(
            theme.surface.opacity(selectedID == segment.id ? 1 : 0.7))
        } else if selectedID == segment.id {
          theme.accent.opacity(0.05)
        }
      }
      .overlay(alignment: .bottom) {
        if theme != .trail && theme != .pocket { Rectangle().fill(theme.line).frame(height: 1) }
      }.opacity(removing ? 0.55 : 1)
    }.buttonStyle(.plain).disabled(isAdding || removing || store.isSending)
      .accessibilityLabel(
        "第\(index + 1)个补给点，\(point.map { rideDistance($0.cumulativeMeters) } ?? "未填写距离")，\(segment.reminder)，编辑"
      )
      .transition(
        reduceMotion
          ? .opacity
          : .asymmetric(
            insertion: .offset(y: 14).combined(with: .opacity),
            removal: .move(edge: .trailing).combined(with: .opacity)))
  }

  private var sendDock: some View {
    VStack(spacing: 10) {
      if let deleted {
        HStack {
          Text("已移除\(deleted.segment.displayName)补给点").font(.footnote)
          Spacer()
          Button("撤销") { undo() }.font(.footnote.weight(.bold)).frame(minHeight: 32)
        }
      }
      if let message = store.submissionMessage ?? store.storageMessage {
        Text(message).font(.footnote).frame(maxWidth: .infinity, alignment: .leading)
          .accessibilityIdentifier("submissionMessage")
      }
      if let message = store.validationMessage {
        Text(message).font(.caption).foregroundStyle(theme.detail).frame(
          maxWidth: .infinity, alignment: .leading)
      }
      Button {
        Task { await store.send() }
      } label: {
        HStack {
          if store.isSending {
            ProgressView().tint(theme.onAccent)
          } else {
            Image(systemName: "applewatch")
          }
          Text(store.isSending ? "正在提交…" : "发送到 Apple Watch").font(.body.weight(.semibold))
          Spacer(minLength: 0)
          Image(systemName: "arrow.up.right")
        }.padding(.horizontal, 18).padding(.vertical, 17)
          .foregroundStyle(canSend || store.isSending ? theme.onAccent : theme.muted)
          .background(
            canSend || store.isSending ? theme.accent : theme.ink.opacity(0.08),
            in: RoundedRectangle(cornerRadius: theme.radius))
      }.buttonStyle(.plain).disabled(!canSend).accessibilityIdentifier("sendPlan")
      Text("在系统“体能训练”中开始骑行").font(.caption2).foregroundStyle(theme.muted)
    }.padding(.horizontal, 24).padding(.vertical, 12).frame(maxWidth: 600).frame(
      maxWidth: .infinity
    )
    .background(theme.canvas).overlay(alignment: .top) {
      Rectangle().fill(theme.line).frame(height: 0.5)
    }
  }

  private func save(_ segment: FuelStop) {
    guard !store.isSending else { return }
    if let index = store.plan.stops.firstIndex(where: { $0.id == segment.id }) {
      store.plan.stops[index] = segment
    } else {
      store.plan.stops.append(segment)
    }
    arrivingID = segment.id
    arrivalEvent = UUID()
  }
  private func remove(_ id: UUID) {
    guard !store.isSending, !removingIDs.contains(id) else { return }
    withAnimation(motion) { _ = removingIDs.insert(id) }
    Task { @MainActor in
      try? await Task.sleep(for: .milliseconds(reduceMotion ? 100 : 480))
      guard let index = store.plan.stops.firstIndex(where: { $0.id == id }) else {
        removingIDs.remove(id)
        return
      }
      withAnimation(motion) {
        deleted = DeletedPoint(segment: store.plan.stops[index], index: index)
        store.plan.stops.remove(at: index)
        removingIDs.remove(id)
        if selectedID == id { selectedID = nil }
      }
    }
  }
  private func undo() {
    guard let deleted, !store.isSending,
      !store.plan.stops.contains(where: { $0.id == deleted.segment.id })
    else { return }
    store.plan.stops.insert(deleted.segment, at: min(deleted.index, store.plan.stops.count))
    arrivingID = deleted.segment.id
    arrivalEvent = UUID()
    self.deleted = nil
  }
  private var help: some View {
    NavigationStack {
      List {
        Section("出发前") {
          Text("先设置计划距离，再添加补给点。每个点填写距出发里程与提醒，可切换米/公里；删除或移动一个点不会改变其他点的位置。自定义类型可以填写补给名称。")
          Text(
            "左右拨动或缩放距离尺，点击右上角“＋补给”，在底部面板选择补给类型、填写手表提示并点“添加”。位置使用打开面板时的读数，取消不改计划；自定义类型另填补给名称。尺上的图标表示已有补给，点击可定位；密集点以数量聚合。修改已有点仍点击列表进入编辑。"
          )
          Text("右上角切换皮肤及交互触感，不改变计划。系统开启减弱动态效果时会简化动画。")
        }
        Section("发送与使用") {
          Text(
            "iPhone 需要 iOS 18+，配对的 Apple Watch 需要 watchOS 11+。发送并授权后，在手表系统体能训练里确认 Kairos 骑行补给，再手动开始。"
          )
          Text("本机提交不代表手表已收到。修改后需要重新发送。里程以显示的一位小数保存和发送；提示名带累计位置，系统下方仍显示分段距离。到计划终点提示完成，仍可继续骑行。")
          Text(
            "历史计划按骑行日期分组，发送后保存当天版本。可刷新 Kairos 的系统排程、查看完成状态或撤回指定日期的计划；这些状态不是手表实时接收回执。撤回保留手机历史和运动记录。")
          Text("水瓶等动效仅为编辑反馈，不表示已经喝水或进食。提醒文字、声音、触感和续航仍需真机测试。")
        }
      }.navigationTitle("使用说明").navigationBarTitleDisplayMode(.inline)
        .toolbar {
          ToolbarItem(placement: .confirmationAction) { Button("完成") { showingHelp = false } }
        }
    }
  }
}
