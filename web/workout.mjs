// Binary field layout reference: changeforan/DotnetWorkoutKit (MIT), commit
// 0978caf9deafeafa3d371daab6f216376a0ec31f. See docs/web-file-sharing.md.
// Only outdoor cycling, meter goals, open goals and step names are emitted.
const utf8 = new TextEncoder();
const title = 'Kairos 骑行补给';

export function roundedMeters(value) {
  const unit = value >= 1000 ? 1000 : 1;
  return Math.round(value / unit * 10) / 10 * unit;
}

export function distanceLabel(value, compact = false) {
  const meters = roundedMeters(value);
  const km = meters >= 1000;
  return `${(km ? meters / 1000 : meters).toFixed(1)}${compact ? '' : ' '}${km ? 'km' : 'm'}`;
}

export function validatePlan(input) {
  if (!input || typeof input.id !== 'string' || !/^[a-f\d]{8}(-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(input.id)) {
    throw new Error('计划标识无效，请刷新页面重试。');
  }
  function meters(value) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1e9) {
      throw new Error('请输入有效的数字距离。');
    }
    return roundedMeters(value);
  }
  const total = meters(input.totalDistanceMeters);
  if (total <= 0) throw new Error('全程距离需要大于 0。');
  if (!Array.isArray(input.stops) || !input.stops.length || input.stops.length > 100) {
    throw new Error('请填写 1 至 100 个补给点。');
  }
  const stops = input.stops.map(stop => {
    const position = meters(stop?.distanceMeters);
    if (position > total) throw new Error('补给点不能超过全程距离。');
    if (typeof stop.reminder !== 'string' || !stop.reminder.trim()) {
      throw new Error('请填写每个点的手表提示。');
    }
    if (utf8.encode(stop.reminder).length > 640) throw new Error('单条提示不能超过 640 字节。');
    return { distanceMeters: position, reminder: stop.reminder.trim() };
  }).sort((a, b) => a.distanceMeters - b.distanceMeters);
  if (new Set(stops.map(stop => stop.distanceMeters)).size !== stops.length) {
    throw new Error('取整后有补给点重合，请合并同一里程的提示。');
  }
  return { id: input.id.toUpperCase(), totalDistanceMeters: total, stops };
}

export function workoutSteps(input) {
  const plan = validatePlan(input);
  const steps = [];
  const name = stop => `${distanceLabel(stop.distanceMeters, true)} ${stop.reminder}`;
  let reminder = plan.stops[0].distanceMeters === 0 ? name(plan.stops[0]) : '骑行';
  let previous = 0;
  for (const stop of plan.stops.filter(stop => stop.distanceMeters > 0)) {
    steps.push({ distanceMeters: stop.distanceMeters - previous, name: reminder });
    previous = stop.distanceMeters;
    reminder = name(stop);
  }
  if (plan.totalDistanceMeters > previous) {
    steps.push({ distanceMeters: plan.totalDistanceMeters - previous, name: reminder });
    reminder = `${distanceLabel(plan.totalDistanceMeters, true)} 计划完成，继续骑行`;
  } else {
    reminder += ' · 计划完成，继续骑行';
  }
  steps.push({ distanceMeters: null, name: reminder });
  return steps;
}

// Small, write-only protobuf subset; all tags and integer values below are bounded constants.
function varint(value) {
  const bytes = [];
  do { bytes.push((value & 127) | (value > 127 ? 128 : 0)); value = Math.floor(value / 128); } while (value);
  return bytes;
}
function integer(field, value) { return [...varint(field * 8), ...varint(value)]; }
function message(field, bytes) { return [...varint(field * 8 + 2), ...varint(bytes.length), ...bytes]; }
function text(field, value) { return message(field, utf8.encode(value)); }
function double(field, value) {
  const data = new Uint8Array(8);
  new DataView(data.buffer).setFloat64(0, value, true);
  return [...varint(field * 8 + 1), ...data];
}

export function encodeWorkout(input) {
  const plan = validatePlan(input);
  const steps = workoutSteps(plan).flatMap(step => {
    const goal = step.distanceMeters === null
      ? integer(1, 4) // Open
      : [...integer(1, 3), ...message(4, [...integer(1, 1), ...double(2, step.distanceMeters)])];
    const workoutStep = [...message(1, goal), ...text(3, step.name)];
    return message(1, [...integer(1, 1), ...message(2, workoutStep)]); // Work interval
  });
  const block = [...steps, ...integer(2, 1)]; // One iteration
  const custom = [...integer(1, 13), ...integer(2, 3), ...text(3, title), ...message(5, block)];
  return Uint8Array.from([
    ...text(9, plan.id), ...message(11, custom), ...integer(1000, 1), ...integer(1002, 5),
  ]);
}
