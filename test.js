'use strict';
const pug = require('pug');
const test = require('node:test');
const assert = require('node:assert');

test('学習内容に含まれる HTML タグがエスケープされる', () => {
  const html = pug.renderFile(
    './views/records.pug',
    {
      records: [
        {
          id: 1,
          content: '<script>alert("XSS!");</script>',
          recordedBy: 'test_user',
          subject: '数学',
          formattedStudyDate: '2026年11月02日',
          minutes: 30,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      user: 'test_user',
      totalMinutes: 30,
      currentTheme: 'light',
      oneTimeToken: 'test-token',
    },
  );

  // メッセージの <script> タグがエスケープされていることをチェック
  assert(html.includes('&lt;script&gt;alert(&quot;XSS!&quot;);&lt;/script&gt;'));
});