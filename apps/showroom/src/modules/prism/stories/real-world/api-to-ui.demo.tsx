import type { JsonObject } from '@niscorp/prism';
import { PrismView } from '../../prism-view';
export const input: JsonObject = {
    response: {
      meta: { total: 3, page: 1, perPage: 10 },
      data: [
        {
          id: 'user_001',
          attributes: { displayName: 'Ada Lovelace', email: 'ada@example.com', avatarUrl: '/avatars/ada.png' },
          permissions: { canEdit: true, canDelete: false },
        },
        {
          id: 'user_002',
          attributes: { displayName: 'Grace Hopper', email: 'grace@example.com', avatarUrl: '/avatars/grace.png' },
          permissions: { canEdit: true, canDelete: true },
        },
        {
          id: 'user_003',
          attributes: { displayName: 'Linus Torvalds', email: 'linus@example.com', avatarUrl: '/avatars/linus.png' },
          permissions: { canEdit: false, canDelete: false },
        },
      ],
    },
  };

export const config = {
    total: { $ref: '$.response.meta.total' },
    users: {
      $map: {
        over: { $ref: '$.response.data' },
        as: 'u',
        body: {
          id: { $get: { from: { $var: 'u' }, path: ['id'] } },
          name: { $get: { from: { $var: 'u' }, path: ['attributes', 'displayName'] } },
          email: { $get: { from: { $var: 'u' }, path: ['attributes', 'email'] } },
          avatar: { $get: { from: { $var: 'u' }, path: ['attributes', 'avatarUrl'] } },
          isAdmin: { $get: { from: { $var: 'u' }, path: ['permissions', 'canDelete'] } },
        },
      },
    },
  };

export const Demo = () => <PrismView input={input} config={config} />;
