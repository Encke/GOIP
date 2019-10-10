const http = require( 'http' );
const https = require( 'https' );
const querystring = require( 'querystring' );

module.exports = {
	set: function( host, port, authUserName, authPassword, commServer, lineData )	{
		goip.options.hostname = host;
		if( port )	{
			goip.options.port = port;
		}
		if( authUserName && authPassword )	{
			goip.auth = ( authUserName + ":" + authPassword );
		}
		if( commServer )	{
			goip.mainServer = commServer;
		}
		if( lineData )	{
			goip.lineData = lineData;
		}
	},
	start: function()	{
		setInterval( goip.getInbox, goip.inboxReloadDelay );
		setInterval( goip.getSendbox, goip.sendReloadDelay );
	},
};

let goip = {
	retryMax: 10,
	retries: 0,
	checkDelay: 3000,
	inboxReloadDelay: 5000,
	sendReloadDelay: 5000,
	base: "/default/en_US/",
	auth: "admin:admin",
	mainServer: "",
	lineData: null,
	options: { port: 80, headers: {} },
	//options: { hostname: "sj.3n.cr", port: 4647 },
	pageData: "",
	inbox: [],
	oldInbox: [],
	isSending: false,
	sendQueue: [],
	send: function( lineNumber, phoneNumber, textContent, callback )	{
		if( goip.isSending )	{
			goip.sendQueue.push( [ lineNumber, phoneNumber, textContent, callback ] );
		}	else {
			goip.isSending = true;
			if( goip.retries < goip.retryMax )	{
				goip.dataSend( ( "tools.html?type=sms&line=" + lineNumber ), "GET", null, function( htmlData )	{
						if( htmlData && ( htmlData.length > 0 ) )	{
							//let isOnline = ( htmlData.split( "Line " + lineNumber + " GSM Status" )[1].split( "<td width=\"160\" class=\"text\">" )[1].substr( 3, 2 ).toUpperCase() == "IN" );
							//isOnline && 
							let smsKey = htmlData.split( "smskey\" value=\"" )[1];
							smsKey = smsKey.substr( 0, smsKey.indexOf( "\"" ) );
							if( smsKey && ( smsKey.length > 2 ) )	{
								goip.dataSend( "sms_info.html?type=sms", "post", { line: lineNumber, smskey: smsKey, action: "SMS", telnum: phoneNumber, smscontent: textContent, send: "Send" }, function( resultData )	{
										setTimeout( function () {
												goip.getSentStatus( lineNumber, callback );
											}, goip.checkDelay );
									});
							}
						}	else {
							goip.isSending = false;
							goip.sendNext();
							callback( "" );
						}
					});
			}
		}
	},
	sendNext: function () {
		if( ( goip.sendQueue.length > 0 ) && !goip.isSending )	{
			let sendThis = goip.sendQueue.shift();
			goip.send( sendThis[0], sendThis[1], sendThis[2], sendThis[3] );
		}
	},
	getSentStatus: function( lineNumber, callback ) {
		if( goip.retries < goip.retryMax )	{
			goip.retries++;
			goip.dataSend( "send_sms_status.xml", "post", { line: lineNumber }, function( resultCheckData )	{
					if( resultCheckData.indexOf( "<status" + lineNumber + ">" ) > -1 )	{
						let sendResult = resultCheckData.split( "<status" + lineNumber + ">" )[1].split( "</error" + lineNumber + ">" )[0].replace( "</status" + lineNumber + ">", "" ).replace( "<error" + lineNumber + ">", "" ).replace( "\t", "" ).split( "\n" );
						if( sendResult[0] == "DONE" )	{
							goip.isSending = false;
							goip.sendNext();
							if( callback )	{
								callback( true );
							}
						}	else if( resultCheckData.length > 0 )	{
							setTimeout( function () {
									goip.getSentStatus( lineNumber, callback );
								}, goip.checkDelay );
						}
					}	else {
						goip.isSending = false;
						goip.sendNext();
						if( callback )	{
							callback( false );
						}
					}
				});
		}
	},
	dataSend: function( path, type, data, callback ) {
		goip.options.path = goip.base + path;
		goip.options.auth = goip.auth;
		goip.options.method = type;
		goip.pageData = "";
		if( type.toLowerCase() == "post" )	{
			var postData = querystring.stringify( data );
			goip.options.headers["Content-Type"] = "application/x-www-form-urlencoded";
			goip.options.headers["Content-Length"] = postData.length;
			goip.options.headers["Connection"] = "close";
		}
		let req = http.request( goip.options, ( res ) => {
				if( res.statusCode == 200 )	{
					res.on( "data", ( d ) => {
							goip.pageData += d;
						});
				}
			});
		req.on( "error", function() {
				if( callback )	{
					callback( "" );
				}
			});
		req.on( "close", function() {
				if( callback )	{
					callback( goip.pageData? goip.pageData: "" );
				}
			});
		if( type.toLowerCase() == "post" )	{
			req.write( postData );
		}
		req.end();
	},
	getInbox: function()	{
		goip.dataSend( "tools.html?type=sms_inbox", "GET", null, function( pageHTML )	{
				let jsData = pageHTML.split( "var sms, pos;\n" )[1];
				if( jsData )	{
					if( goip.inbox )	{
						goip.oldInbox = goip.inbox;
						goip.inbox = [];
					}
					jsData = jsData.substr( 0, jsData.indexOf( "</script>" ) ).split( "sms_row_insert(l" );
					jsData.pop();
					for( let i = 0; i < jsData.length; i++ )	{
						goip.inbox[i] = JSON.parse( jsData[i].split( "sms= " )[1].split( ";" )[0] );
						if( !goip.oldInbox[i] )	{
							goip.oldInbox[i] = [];
						}
						for( let n = 0; n < goip.inbox[i].length; n++ )	{
							let thisTime = goip.inbox[i][n].substr( 6, 8 );
							goip.inbox[i][n] = goip.inbox[i][n].substr( 15 ).trim();
							if( goip.inbox[i][n].length > 0 )	{
								goip.inbox[i][n] = goip.inbox[i][n].split( "," );
								goip.inbox[i][n].push( thisTime );
								if( goip.inbox[i] && goip.inbox[i][n] && goip.oldInbox[i][n] && ( goip.inbox[i][n].join( "," ).trim() != goip.oldInbox[i][n].join( "," ).trim() ) )	{
									var postData = querystring.stringify( { to: i, text: goip.inbox[i][n][1], from: goip.inbox[i][n][0], timestamp: goip.inbox[i][n][2] } );
									if( goip.lineData )	{
										postData = querystring.stringify( goip.lineData( i, goip.inbox[i][n][1], goip.inbox[i][n][0], goip.inbox[i][n][2] ) );
									}
									let options = { host: goip.mainServer, port: "443", method: "POST", path: "/insms", headers: {} };
									options.headers["Content-Type"] = "application/x-www-form-urlencoded";
									options.headers["Content-Length"] = postData.length;
									options.headers["Connection"] = "close";
									let req = https.request( options, function( res )	{
											res.setEncoding( "utf8" );
										});
									req.write( postData );
									req.end();
								}
							}
						}
					}
				}
			});
	},
	getSendbox: function()	{
		let options = { host: goip.mainServer, port: "443", method: "GET", path: "/sendbox" };
		let req = https.request( options, function( res )	{
				res.setEncoding( "utf8" );
				let responseData = "";
				res.on( "data", function( chunk )	{
						responseData += chunk;
					});
				req.on( "close", function() {
						if( responseData.length > 1 )	{
							let sendList = JSON.parse( responseData );
							if( sendList.length > 0 )	{
								for( let i = 0; i < sendList.length; i++ )	{
									goip.sendQueue.push( [ ( ( sendList[i][0] == "50683150775" )? 2: 3 ), sendList[i][1], sendList[i][2], null ] );
								}
								goip.sendNext();
							}
						}
					});
			});
		req.end();
	}
};