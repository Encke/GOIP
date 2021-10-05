const http = require('http')
const https = require('https')
const querystring = require('querystring')
const sms = require('../src/goip')

let formatLineData = function(
  lineNumber,
  messageText,
  messageFrom,
  messageTime
) {
  return {
    authentication: '1234567890',
    to: lineNumber == 1 ? '14155551212' : '14155551313',
    text: messageText,
    from: messageFrom,
    timestamp: messageTime,
    messageID: lineNumber + '-' + messageTime + '-' + messageFrom
  }
}

sms.set('192.168.8.1', 80, 'admin', 'admin', 'mysmsserver.com', formatLineData)
sms.start()
