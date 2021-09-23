import {privateKey, tsvList, webSocketEndpoint} from './secrets.js';
import {addresses} from './config.js';
import {getWhiteList} from './utilities.js';
import { ethers } from 'ethers';
import {JsonRpcProvider} from '@ethersproject/providers';
import open from 'open';
import notifier from 'node-notifier';

const SELL_AMOUNT = 1;
let SELL_TOKEN = addresses.BUSD;
let BUY_TOKEN = '0x9fd87aefe02441b123c3c32466cd9db4c578618f';
const SLIPPAGE_TOLERANCE = 0.5; //RANGE 0.01% - 49%
const DEADLINE_MINUTES = 10; // >= 1
const APPROVE_MAX_TRANSACTIONS = SELL_AMOUNT * 1; //any number larger than SELL_AMOUNT


const EXPECTED_PONG_BACK = 10000;
const KEEP_ALIVE_CHECK_INTERVAL = 5000;

export const startConnection = async () => {
	
	let FOLLOW = [];
	let whiteList = await getWhiteList(tsvList);
	whiteList = whiteList.map(v => ethers.utils.getAddress(v));	
	
	const webSocketProvider = new ethers.providers.WebSocketProvider(webSocketEndpoint);
	const rpcProvider = new JsonRpcProvider('https://bsc-dataseed1.binance.org/');
	const wallet = new ethers.Wallet(privateKey, rpcProvider);
	const webSocketSigner = wallet.connect(webSocketProvider);
	const rpcSigner = wallet.connect(rpcProvider);
	let pingTimeout = null;
	let keepAliveInterval = null;
	SELL_TOKEN = ethers.utils.getAddress(SELL_TOKEN);
	BUY_TOKEN = ethers.utils.getAddress(BUY_TOKEN);
	
	webSocketProvider._websocket.on('open', () => {
		
		keepAliveInterval = setInterval(() => {
			console.log('Checking if the connection is alive, sending a ping')

			webSocketProvider._websocket.ping();

			pingTimeout = setTimeout(() => {

				webSocketProvider._websocket.terminate();

			}, EXPECTED_PONG_BACK);
			
		}, KEEP_ALIVE_CHECK_INTERVAL);
		
		const webSocketFactory = new ethers.Contract(
			addresses.FACTORY,
			['event PairCreated(address indexed token0, address indexed token1, address pair, uint)'],
			webSocketSigner
		);




		webSocketFactory.on('PairCreated', async (token0, token1, pairAddress) => {
			
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

			}

			FOLLOW.push(tokenOut);
		});
		
		
	});
	
	setInterval(() => {
		
		FOLLOW.forEach(async (tokenOut) => {
			
			console.log(`--- Searching liquidity for ${tokenOut} ---`);
			console.log(`--- Trying to sell ${SELL_TOKEN} ---`);
						
			try{
				
				const rPcRouter = new ethers.Contract(
					addresses.ROUTER,
					[
						'function getAmountsOut(uint amountIn, address[] memory path) public view returns (uint[] memory amounts)',
						'function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)'
					],
					rpcSigner
				);			
				
				let rpcContract = new ethers.Contract(
					SELL_TOKEN, 
					["function approve(address _spender, uint256 _value) public returns (bool success)"], 
					rpcSigner
				);				
				
				await rpcContract.approve(
					addresses.ROUTER, 
					ethers.utils.parseUnits(APPROVE_MAX_TRANSACTIONS.toString(), 18), 
					{gasLimit: 100000, gasPrice: 5e9}
				);

				let amountIn = (SELL_AMOUNT * ((100 - SLIPPAGE_TOLERANCE) / 100)).toString();
				amountIn = ethers.utils.parseUnits(amountIn.toString(), 18);
			
				console.log(amountIn);
			
				const amountsOut = await rPcRouter.getAmountsOut(amountIn, [SELL_TOKEN, tokenOut]);
				
				if(Array.isArray(amountsOut))
				{
					const followUpIndex = FOLLOW.indexOf(tokenOut);
					const amountOutMin = amountsOut[1];
					
					console.log({amountOutMin: ethers.utils.formatUnits(amountOutMin.toString(), 'ether')});					
					notifier.notify({
						title: 'Token Listed',
						message: tokenOut,
						open: `https://bscscan.com/token/${tokenOut}`
					});	

					if (followUpIndex !== -1) {
					  FOLLOW.splice(followUpIndex, 1);
					  console.log(`${tokenOut} removed from FOLLOW`);
					}					
				}
			}
			catch(e){
				console.log('No Liquidity Provided Yet');
			}			
		});
		
	}, 10000);
	
	setTimeout(() => {
		const thetanArenaDummyTest = '0x9fd87aefe02441b123c3c32466cd9db4c578618f';
		console.log(`--- ${thetanArenaDummyTest} added for testing ---`)
		FOLLOW.push(ethers.utils.getAddress(thetanArenaDummyTest));
	}, 5000);

	webSocketProvider._websocket.on('close', () => {
		console.log('The websocket connection was closed');
		clearInterval(keepAliveInterval);
		clearTimeout(pingTimeout);
		startConnection();
	})

	webSocketProvider._websocket.on('pong', () => {
		console.log('Received pong, so connection is alive, clearing the timeout');
		clearInterval(pingTimeout);
	});
};

startConnection();