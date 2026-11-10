import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { encodeWorkout, validatePlan } from '../web/workout.mjs';

const output = resolve(process.argv[2] ?? '/private/tmp/kairos-workout-interop');
await mkdir(output, { recursive: true });
const examples = [
  ['departure-and-end', 1000, [[0, '出发前喝水'], [200, '喝水'], [400, '吃胶'], [1000, '吃巧克力']]],
  ['tail', 1000, [[200, '喝水'], [600, '吃胶']]],
  ['departure-only', 1000, [[0, '先吃早餐']]],
  ['endpoint-only', 75000, [[75000, '喝水']]],
  ['fractional', 850.5, [[0.1, '喝水'], [800.3, '吃胶']]],
  ['kilometers', 100000, [[25001, '吃胶'], [45000, '喝水'], [70000, '吃巧克力']]],
  ['long-text', 1000, [[200, '补给提醒：水和胶，'.repeat(15)], [1000, '终点补给 🧃']]],
];
for (const [index, [name, total, stops]] of examples.entries()) {
  const plan = validatePlan({
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    totalDistanceMeters: total,
    stops: stops.map(([distanceMeters, reminder]) => ({ distanceMeters, reminder })),
  });
  await writeFile(join(output, `${name}.json`), JSON.stringify(plan, null, 2));
  await writeFile(join(output, `${name}.workout`), encodeWorkout(plan));
}
console.log(`Generated ${examples.length} cases in ${output}`);
