'use strict';
const pug = require('pug');
const Cookies = require('cookies');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({ log: [ 'query' ] });
const util = require('./handler-util')
const { currentThemeKey } = require('../config');

const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
const relativeTime = require('dayjs/plugin/relativeTime');
require('dayjs/locale/ja');
dayjs.locale('ja');
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(relativeTime);
dayjs.tz.setDefault('Asia/Tokyo');
const crypto = require('node:crypto');

const oneTimeTokenMap = new Map(); // キーをユーザ名、値をトークンとする連想配列

async function handle(req, res) {
  const cookies = new Cookies(req, res);
  const currentTheme = cookies.get(currentThemeKey) || 'light';
  const options = { maxAge: 30 * 86400 * 1000 };
  cookies.set(currentThemeKey, currentTheme, options);
  switch (req.method) {
    case 'GET':
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8'
      });
      const records = await prisma.record.findMany({
  where: {
    recordedBy: req.user
  },
  orderBy: [
    { studyDate: 'desc' },
    { id: 'desc' }
  ]
});

let totalMinutes = 0;

records.forEach((record) => {
  record.formattedStudyDate =
    dayjs.utc(record.studyDate).format('YYYY年MM月DD日（ddd）');

  totalMinutes += record.minutes;
});

      const oneTimeToken = crypto.randomBytes(8).toString('hex');
      oneTimeTokenMap.set(req.user, oneTimeToken);
      res.end(pug.renderFile('./views/records.pug', {
        currentTheme,
        records,
        totalMinutes,
        user: req.user,
        oneTimeToken
      }));
      console.info(
        `閲覧されました: user: ${req.user}, ` +
        `remoteAddress: ${req.socket.remoteAddress}, ` +
        `userAgent: ${req.headers['user-agent']} `
      );
      break;
    case 'POST':
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      }).on('end', async () => {
        const params = new URLSearchParams(body);
        const studyDate = params.get('studyDate');
        const subject = (params.get('subject'));
        const content = (params.get('content'));
        const minutes = parseInt(params.get('minutes'), 10);
        const requestedOneTimeToken = params.get('oneTimeToken');
        if (
          !studyDate ||
          !subject ||
          subject.length > 100 ||
          !content ||
          !minutes ||
          minutes <= 0 ||
          minutes > 1440
        ) {
          util.handleBadRequest(req, res);
          return;
        }

        if (!requestedOneTimeToken) {
          util.handleBadRequest(req, res);
          return;
        }
        if (oneTimeTokenMap.get(req.user) !== requestedOneTimeToken) {
          util.handleBadRequest(req, res);
          return;
        }
        console.info(`送信されました: ${content}`);
        //データベースにデータを保存する
        await prisma.record.create({
          data: {
            studyDate: new Date(studyDate),
            subject,
            content,
            minutes,
            recordedBy: req.user
          }
        });
        oneTimeTokenMap.delete(req.user);
        handleRedirectRecords(req, res);
      });
      break;
    default:
      break;
  }
}

function handleRedirectRecords(req, res) {
  res.writeHead(303, {
    'Location': '/records'
  });
  res.end();
}

function handleDelete(req, res) {
  switch (req.method) {
    case 'POST':
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      }).on('end', async () => {
        const params = new URLSearchParams(body);
        const requestedOneTimeToken = params.get('oneTimeToken');

        if (
          !requestedOneTimeToken ||
          oneTimeTokenMap.get(req.user) !== requestedOneTimeToken
        ) {
          util.handleBadRequest(req, res);
          return;
        }
        const id = parseInt(params.get('id'));
        if (!id) {
          util.handleBadRequest(req, res);
          return;
        }
        const record = await prisma.record.findUnique({
          where: { id }
        });
        if (!record) {
          util.handleBadRequest(req, res);
          return;
        }
       if (req.user === record.recordedBy) {
          await prisma.record.delete({
            where: { id }
          });
          oneTimeTokenMap.delete(req.user);
          handleRedirectRecords(req, res);
        } else {
          util.handleBadRequest(req, res);
        }
      });
      break;
    default:
      util.handleBadRequest(req, res);
      break;
  }
}

module.exports = {
  handle,
  handleDelete,
};