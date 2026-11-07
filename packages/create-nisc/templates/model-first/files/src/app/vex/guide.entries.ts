import type { SeedEntry } from '@niscorp/vex';

export const guidePackages: SeedEntry = {
  fingerprint: 'guide/packages',
  intent: 'Every nisc package with what it is for, in the order the tour names them',
  shape: [{ title: '', text: '' }],
  dsl: {
    from: ['packages'],
    fields: ['packages.name', 'packages.purpose'],
    sort: [{ field: 'packages.position', dir: 'asc' }],
    limit: 20,
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'package',
      body: {
        title: { $interpolate: { template: '@niscorp/{{name}}', values: { $var: 'package' } } },
        text: { $get: { from: { $var: 'package' }, path: ['purpose'] } },
      },
    },
  },
};
