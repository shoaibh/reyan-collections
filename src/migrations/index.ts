import * as migration_20261124_105104_initial from './20261124_105104_initial';

export const migrations = [
  {
    up: migration_20261124_105104_initial.up,
    down: migration_20261124_105104_initial.down,
    name: '20261124_105104_initial'
  },
];
