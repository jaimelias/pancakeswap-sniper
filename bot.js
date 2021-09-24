import {privateKey, publicKey, tsvList, webSocketEndpoint} from './secrets.js';
import {addresses} from './config.js';
import {getWhiteList} from './utilities.js';
import { ethers } from 'ethers';
import {JsonRpcProvider} from '@ethersproject/providers';
import open from 'open';
import notifier from 'node-notifier';

const IS_PRODUCTION = true;
const SELL_AMOUNT = 1;
let SELL_TOKEN = addresses.BUSD;
const SLIPPAGE_TOLERANCE = 0.5; //RANGE 0.01% - 49%
const DEADLINE_MINUTES = 5; // >= 1
const APPROVE_MAX_TRANSACTIONS = SELL_AMOUNT * 1; //any number larger than SELL_AMOUNT
let CONTRACTS_TRADED = [];
let TARGET_CONTRACTS = await getWhiteList(tsvList);
TARGET_CONTRACTS = TARGET_CONTRACTS.map(v => ethers.utils.getAddress(v));

const EXPECTED_PONG_BACK = 15000;
const KEEP_ALIVE_CHECK_INTERVAL = 7500;

const startConnection = async () => {
	const webSocketProvider = new ethers.providers.WebSocketProvider(webSocketEndpoint);
	const rpcProvider = new JsonRpcProvider('https://bsc-dataseed1.binance.org/');
	const wallet = new ethers.Wallet(privateKey, rpcProvider);
	const webSocketSigner = wallet.connect(webSocketProvider);
	const rpcSigner = wallet.connect(rpcProvider);
	let pingTimeout = null;
	let keepAliveInterval = null;
	
	SELL_TOKEN = ethers.utils.getAddress(SELL_TOKEN);
	
	const rpcRouter = new ethers.Contract(
		addresses.ROUTER,
		[
			'function getAmountsOut(uint amountIn, address[] memory path) public view returns (uint[] memory amounts)',
			'function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)'
		],
		rpcSigner
	);

	const rpcFactory = new ethers.Contract(
		addresses.FACTORY,
		[
			'function getPair(address tokenA, address tokenB) external view returns (address pair)'
		],
		rpcSigner
	);		
	
	const webSocketFactory = new ethers.Contract(
		addresses.FACTORY,
		['event PairCreated(address indexed token0, address indexed token1, address pair, uint)'],
		webSocketSigner
	);	
	
	let rpcSellContract = new ethers.Contract(
		SELL_TOKEN, 
		['function approve(address _spender, uint256 _value) public returns (bool success)'], 
		rpcSigner
	);
	
	if(IS_PRODUCTION)
	{
		await rpcSellContract.approve(
			addresses.ROUTER, 
			ethers.utils.parseUnits(APPROVE_MAX_TRANSACTIONS.toString(), 18), 
			{gasLimit: 100000, gasPrice: 5e9}
		);		
	}
	
	webSocketProvider._websocket.on('open', () => {
		
		keepAliveInterval = setInterval(() => {
			
			console.log('Checking if the connection is alive, sending a ping');
			webSocketProvider._websocket.ping();

			//terminate connection after interval
			pingTimeout = setTimeout(() => { webSocketProvider._websocket.terminate()}, EXPECTED_PONG_BACK);
		  
		}, KEEP_ALIVE_CHECK_INTERVAL);	
		
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

			if(TARGET_CONTRACTS.includes(tokenOut))
			{
				startSniper(tokenOut);
				
				console.log(`Listed ${tokenOut}`);
				
				notifier.notify({
					title: 'Contract Listed!',
					message: tokenOut,
					open: tradeUrl
				});
			}
		});

	});

	const startSniper = async (tokenOut) => {

		const pair = await rpcFactory.getPair(SELL_TOKEN, tokenOut);
		
		if(pair === '0x0000000000000000000000000000000000000000')
		{
			return;
		}
		
		let amountIn = (SELL_AMOUNT * ((100 - SLIPPAGE_TOLERANCE) / 100)).toString();
		amountIn = ethers.utils.parseUnits(amountIn.toString(), 18);		
		const amountsOut = await rpcRouter.getAmountsOut(amountIn, [SELL_TOKEN, tokenOut]);
		
		if(Array.isArray(amountsOut))
		{
			
			CONTRACTS_TRADED.push(tokenOut);
			
			console.log(`
			
				--- Contract has liquidity ---
				
				${tokenOut}
			`);
			
			const amountOutMin = amountsOut[1];
			
			console.log({amountOutMin: ethers.utils.formatUnits(amountOutMin.toString(), 'ether')});					
			notifier.notify({
				title: 'Contract has liquidity',
				message: tokenOut,
				open: `https://bscscan.com/token/${tokenOut}`
			});	

			if(!IS_PRODUCTION)
			{
				return;
			}

			const deadline = Math.floor(Date.now() / 1000) + 60 * DEADLINE_MINUTES;
			
			// Execute transaction
			const tx = await rpcRouter.swapExactTokensForTokens(
				ethers.utils.parseUnits(SELL_AMOUNT.toString(), 18),
				amountOutMin,
				[SELL_TOKEN, tokenOut],
				publicKey,
				deadline,
				{ 
					gasLimit: ethers.utils.hexlify(200000), 
					gasPrice: ethers.utils.parseUnits('10', 'gwei') 
				}
			);
			
			console.log(`Tx-hash: ${tx.hash}`);
			
			const receipt = await tx.wait();
			const tradeUrl = `https://bscscan.com/tx/${tx.hash}`;
			
			await open(tradeUrl);
			
			notifier.notify({
				title: 'Transaction Submited!',
				message: `Hash: ${tx.hash}`,
				open: tradeUrl
			});

			console.log(receipt);
		}	
	}; 
	
	setInterval(() => {
				
		TARGET_CONTRACTS.filter(v => !CONTRACTS_TRADED.includes(v)).forEach(async (tokenOut) => {
			startSniper(tokenOut);
		});
		
	}, 1000);
	
	setInterval(() => {
				
		if(TARGET_CONTRACTS.length > 0)
		{
			console.log(`
				--- Searching liquidity for contracts ---
			`);
			console.log(TARGET_CONTRACTS.join('\n'));
		}
		
	}, 30000);
	
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