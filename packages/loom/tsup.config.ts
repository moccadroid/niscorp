import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'react/index': 'src/react/index.ts',
    'plugins/vex/index': 'src/plugins/vex/index.ts',
    'plugins/vex/react/index': 'src/plugins/vex/react/index.ts',
    'plugins/nova/index': 'src/plugins/nova/index.ts',
    'plugins/nova/react/index': 'src/plugins/nova/react/index.ts',
    'plugins/prism/index': 'src/plugins/prism/index.ts',
    'plugins/prism/react/index': 'src/plugins/prism/react/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  target: 'es2022',
  external: ['react', 'react-dom', '@niscorp/nova', '@niscorp/prism', '@niscorp/vex', 'zod'],
});
