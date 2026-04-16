import type { JsonObject } from '@niscorp/prism';
import { PrismView } from '@showroom/modules/prism/prism-view';
export const input: JsonObject = {
    folders: [
      { name: 'work', files: ['report.pdf', 'notes.md'] },
      { name: 'personal', files: ['photo.jpg'] },
      { name: 'archive', files: ['old.txt', 'older.txt', 'oldest.txt'] },
    ],
  };

export const config = {
    $flatMap: {
      over: { $ref: '$.folders' },
      as: 'folder',
      body: { $get: { from: { $var: 'folder' }, path: ['files'] } },
    },
  };

export const Demo = () => <PrismView input={input} config={config} />;
