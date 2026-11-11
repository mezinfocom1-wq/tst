import { earliestFit, merge, slotStarts, subtract } from '../src/scheduling/intervals';
import { QueueService } from '../src/queue/queue.service';
import { SchedulingService, StaffDay } from '../src/scheduling/scheduling.service';

const MIN = 60_000;
const at = (h: number, m = 0) => (h * 60 + m) * MIN;
const service = (id: string, durationMin: number) => ({ id, durationMin }) as never;

function lane(id: string, work: [number, number][], busy: [number, number][], serviceIds: string[]): StaffDay {
  const w = work.map(([start, end]) => ({ start, end }));
  const b = busy.map(([start, end]) => ({ start, end }));
  return { staff: { id } as never, serviceIds: new Set(serviceIds), work: w, busy: b, appointments: b, free: subtract(w, b) };
}

describe('intervalles', () => {
  it('fusionne les intervalles qui se touchent ou se recouvrent', () => {
    expect(merge([{ start: 5, end: 9 }, { start: 0, end: 5 }, { start: 20, end: 30 }])).toEqual([{ start: 0, end: 9 }, { start: 20, end: 30 }]);
  });

  it('retire les périodes occupées des périodes de travail', () => {
    const free = subtract([{ start: at(9), end: at(13) }, { start: at(15), end: at(20) }], [{ start: at(10), end: at(11) }, { start: at(12, 30), end: at(16) }]);
    expect(free).toEqual([{ start: at(9), end: at(10) }, { start: at(11), end: at(12, 30) }, { start: at(16), end: at(20) }]);
  });

  it('propose des créneaux alignés sur la grille et entièrement contenus dans le temps libre', () => {
    const slots = slotStarts([{ start: at(9, 5), end: at(10) }], 30 * MIN, 15 * MIN, 0, 0);
    expect(slots).toEqual([at(9, 15), at(9, 30)]);
  });

  it('ne propose aucun créneau avant le délai minimal', () => {
    expect(slotStarts([{ start: at(9), end: at(11) }], 30 * MIN, 30 * MIN, 0, at(10))).toEqual([at(10), at(10, 30)]);
  });

  it('trouve le premier instant où une durée tient', () => {
    const free = [{ start: at(9), end: at(9, 20) }, { start: at(10), end: at(12) }];
    expect(earliestFit(free, at(9), 30 * MIN)).toBe(at(10));
    expect(earliestFit(free, at(11, 45), 30 * MIN)).toBeNull();
  });
});

describe('planification de groupe', () => {
  const scheduling = new SchedulingService(null as never);
  const cut = service('cut', 30);

  it('enchaîne les passages chez le même professionnel en mode consécutif', () => {
    const days = [lane('a', [[at(9), at(12)]], [], ['cut'])];
    const plan = scheduling.plan(days, [{ service: cut }, { service: cut }], at(9), 'CONSECUTIVE');
    expect(plan?.map((p) => [p.staffId, p.start, p.end])).toEqual([['a', at(9), at(9, 30)], ['a', at(9, 30), at(10)]]);
  });

  it('répartit sur des professionnels différents en mode parallèle', () => {
    const days = [lane('a', [[at(9), at(12)]], [], ['cut']), lane('b', [[at(9), at(12)]], [], ['cut'])];
    const plan = scheduling.plan(days, [{ service: cut }, { service: cut }], at(9), 'PARALLEL');
    expect(new Set(plan?.map((p) => p.staffId)).size).toBe(2);
    expect(plan?.every((p) => p.start === at(9))).toBe(true);
  });

  it('refuse le groupe entier si une seule prestation ne peut pas être placée', () => {
    const days = [lane('a', [[at(9), at(12)]], [], ['cut'])];
    expect(scheduling.plan(days, [{ service: cut }, { service: cut }], at(9), 'PARALLEL')).toBeNull();
    expect(scheduling.plan(days, [{ service: cut }, { service: cut }], at(11, 30), 'CONSECUTIVE')).toBeNull();
  });

  it('respecte le professionnel demandé et ses compétences', () => {
    const days = [lane('a', [[at(9), at(12)]], [], ['other']), lane('b', [[at(9), at(12)]], [], ['cut'])];
    expect(scheduling.plan(days, [{ service: cut, staffId: 'a' }], at(9), 'CONSECUTIVE')).toBeNull();
    expect(scheduling.plan(days, [{ service: cut }], at(9), 'CONSECUTIVE')?.[0].staffId).toBe('b');
  });
});

describe("file d'attente hybride (priorité au rendez-vous)", () => {
  const queue = new QueueService(null as never, null as never, null as never, null as never, null as never, null as never);
  const duration = (_: string, s: { durationMin: number }) => s.durationMin;
  const ticket = (id: string, minutes: number, joined: number, staffId: string | null = null) =>
    ({ id, staffId, joinedAt: new Date(joined), service: service('cut', minutes) }) as never;

  it('ne place pas un ticket qui empiéterait sur un rendez-vous', () => {
    // Karim : rendez-vous de 15 h à 15 h 30. Il est 14 h 40 ; une coupe de 30 min finirait à 15 h 10.
    const days = [lane('karim', [[at(9), at(20)]], [[at(15), at(15, 30)]], ['cut'])];
    const [e] = queue.simulate(days, [ticket('t1', 30, at(14, 30))], duration, at(14, 40));
    expect(e.estimatedStart?.getTime()).toBe(at(15, 30));
    expect(e.estimatedWaitMin).toBe(50);
  });

  it("oriente vers un autre professionnel libre quand le client choisit « peu importe »", () => {
    const days = [
      lane('karim', [[at(9), at(20)]], [[at(15), at(15, 30)]], ['cut']),
      lane('youssef', [[at(9), at(20)]], [], ['cut']),
    ];
    const [e] = queue.simulate(days, [ticket('t1', 30, at(14, 30))], duration, at(14, 40));
    expect(e.suggestedStaffId).toBe('youssef');
    expect(e.estimatedWaitMin).toBe(0);
  });

  it('laisse un ticket court remplir le trou avant un rendez-vous', () => {
    const days = [lane('karim', [[at(9), at(20)]], [[at(15), at(15, 30)]], ['cut'])];
    const result = queue.simulate(days, [ticket('long', 30, at(14)), ticket('court', 15, at(14, 10))], duration, at(14, 40));
    const byId = Object.fromEntries(result.map((r) => [r.ticketId, r]));
    expect(byId.court.estimatedStart?.getTime()).toBe(at(14, 40));
    expect(byId.long.estimatedStart?.getTime()).toBe(at(15, 30));
    expect(byId.court.position).toBe(1);
    expect(byId.long.peopleAhead).toBe(1);
  });

  it("indique qu'il n'y a plus de place quand la journée est pleine", () => {
    const days = [lane('karim', [[at(9), at(15)]], [], ['cut'])];
    const [e] = queue.simulate(days, [ticket('t1', 30, at(14))], duration, at(14, 45));
    expect(e.estimatedStart).toBeNull();
  });
});
