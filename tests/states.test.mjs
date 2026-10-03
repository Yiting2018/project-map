import assert from 'node:assert/strict';
import { test } from 'node:test';

import { technicalCsp } from '../src/server.mjs';
import { validateSvg } from '../src/states.mjs';

test('validateSvg accepts passive graphics and local fragment references unchanged', () => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
    <defs><linearGradient id="fill"><stop offset="0" stop-color="#fff"/></linearGradient></defs>
    <circle id="dot" cx="10" cy="10" r="4" fill="url(#fill)"/>
    <use href="#dot" transform="translate(2 0)"/>
  </svg>`;

  assert.equal(validateSvg(svg), svg);
});

test('validateSvg rejects active, embedded, styled, and externally referenced content', async t => {
  const unsafe = [
    ['script', '<svg><script>alert(1)</script></svg>'],
    ['foreign object', '<svg><foreignObject><div>embedded</div></foreignObject></svg>'],
    ['event handler', '<svg onload="alert(1)"><circle/></svg>'],
    ['style element', '<svg><style>circle { fill: red }</style><circle/></svg>'],
    ['style attribute', '<svg><circle style="fill: red"/></svg>'],
    ['external href', '<svg><use href="https://invalid.example/shape.svg#dot"/></svg>'],
    ['external CSS URL', '<svg><circle fill="url(https://invalid.example/fill.svg#paint)"/></svg>'],
  ];

  for (const [name, svg] of unsafe) {
    await t.test(name, () => {
      assert.throws(() => validateSvg(svg), /passive|external|CSS|resource|Mermaid/i);
    });
  }
});

test('technical dashboard policy blocks connections and external images', () => {
  const directives = new Map(
    technicalCsp.split(';').map(part => part.trim()).filter(Boolean).map(part => {
      const [name, ...values] = part.split(/\s+/);
      return [name, values];
    }),
  );

  assert.deepEqual(directives.get('connect-src'), ["'none'"]);
  assert.deepEqual(directives.get('img-src'), ["'self'", 'data:']);
  assert.equal(directives.get('img-src').some(value => /^(?:https?:|\*)$/i.test(value)), false);
});
