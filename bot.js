import {privateKey} from './secrets.js';
import {webSocketEndpoint, whiteListSheet, addresses} from './config.js';
import {listedText, getConsoleLog, swapUrl} from './utilities.js';
import { ethers } from 'ethers';
import fetch from 'node-fetch';
import open from 'open';
import notifier from 'node-notifier';

const webSocketProvider = new ethers.providers.WebSocketProvider(webSocketEndpoint);

const EXPECTED_PONG_BACK = 15000;
const KEEP_ALIVE_CHECK_INTERVAL = 7500;

const getWhiteList = async () => {
	
	const response = await fetch(whiteListSheet);
	
	if(response.ok)
	{
		const data = await response.text();
		
		if(data)
		{
			return data.split('\n')
			.filter((v, i) => i > 0)
			.map(v => v.split('\t')[2])
			.filter(v => v);
		}
	}

	return [];
};


const startConnection = async () => {
	let whiteList = await getWhiteList();
	whiteList = whiteList.map(v => ethers.utils.getAddress(v));
	const wallet = new ethers.Wallet(Buffer.from(privateKey, 'hex'));
	const webSocketSigner = wallet.connect(webSocketProvider);
	let pingTimeout = null;
	let keepAliveInterval = null;
	console.log(whiteList);
		
	webSocketProvider._websocket.on('open', () => {
		
		//check if websocket is alive
		keepAliveInterval = setInterval(() => {
			
			console.log('Checking if the connection is alive, sending a ping');
			webSocketProvider._websocket.ping();

			//terminate connection after interval
			pingTimeout = setTimeout(() => { webSocketProvider._websocket.terminate()}, EXPECTED_PONG_BACK);
		  
		}, KEEP_ALIVE_CHECK_INTERVAL);		
		
		
		const factory = new ethers.Contract(
			addresses.FACTORY,
			['event PairCreated(address indexed token0, address indexed token1, address pair, uint)'],
			webSocketSigner
		);
		
		factory.on('PairCreated', async (token0, token1, pairAddress) => {
			
			let tokenIn, tokenOut;
			token0 = ethers.utils.getAddress(token0);
			token1 = ethers.utils.getAddress(token1);
			const addessWBNB = ethers.utils.getAddress(addresses.WBNB);
			
			console.log({token0, token1, addessWBNB});
			
			if(token0 === addessWBNB) {
				tokenIn = token0; 
				tokenOut = token1;
			}

			if(token1 == addessWBNB) {
				tokenIn = token1; 
				tokenOut = token0;
			}

			//The quote currency is not WBNB
			if(typeof tokenIn === 'undefined') {
				return;
			}	

			if(whiteList.includes(tokenOut))
			{
				console.log(listedText);
				console.log(getConsoleLog({tokenIn, tokenOut, pairAddress}));
				
				const tradeUrl = `${swapUrl}${tokenOut}`;
				await open(tradeUrl);
				
				notifier.notify({
					title: 'PancakeSwap Sniper',
					message: tokenOut,
					open: tradeUrl
				});
			}

		});

	});
	
	webSocketProvider._websocket.on('close', () => {
		console.log('The websocket connection was closed');
		clearInterval(keepAliveInterval);
		clearTimeout(pingTimeout);
		startConnection();
	});

	webSocketProvider._websocket.on('pong', () => {
		console.log('Received pong, so connection is alive, clearing the timeout');
		clearInterval(pingTimeout);
	});
	
};

startConnection();