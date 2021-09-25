import {privateKey, publicKey, tsvList, webSocketEndpoint} from './secrets.js';
import {addresses} from './config.js';
import {getWhiteList} from './utilities.js';
import { ethers } from 'ethers';
import {JsonRpcProvider} from '@ethersproject/providers';
import open from 'open';
import notifier from 'node-notifier';

const IS_PRODUCTION = true;
let SELL_TOKEN = addresses.BUSD;
const TARGET_CONTRACTS = [
	{
		code: 'RPG',
		address: '0x01e0d17a533e5930a349c2bb71304f04f20ab12b',
		maximumPriceAccepted: 0.5,
		sellAmountInBusd: 0.545
	}
]
.map(v => {
	v.address = ethers.utils.getAddress(v.address);
	return v;
});

//CONFIGS
const SLIPPAGE_TOLERANCE = 0.5; //RANGE 0.01% - 49%
const DEADLINE_MINUTES = 5; // >= 1
let CONTRACTS_TRADED = [];
const APPROVE_MAX_TRANSACTIONS = TARGET_CONTRACTS
.reduce((accumulator, o) => accumulator + o.sellAmountInBusd, 0);


const startConnection = async () => {

	const webSocketProvider = new ethers.providers.WebSocketProvider(webSocketEndpoint);
	const rpcProvider = new JsonRpcProvider('https://bsc-dataseed1.binance.org/');
	const wallet = new ethers.Wallet(privateKey, rpcProvider);
	const webSocketSigner = wallet.connect(webSocketProvider);
	const rpcSigner = wallet.connect(rpcProvider);
	const EXPECTED_PONG_BACK = 15000;
	const KEEP_ALIVE_CHECK_INTERVAL = 7500;	
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
		[
			'function approve(address _spender, uint256 _value) public returns (bool success)',
			'function decimals() view returns (uint8)'
		], 
		rpcSigner
	);
	
	const sellTokenDecimals = await rpcSellContract.decimals();
	
	if(IS_PRODUCTION)
	{
		await rpcSellContract.approve(
			addresses.ROUTER, 
			ethers.utils.parseUnits(APPROVE_MAX_TRANSACTIONS.toString(), sellTokenDecimals), 
			{gasLimit: 100000, gasPrice: 5e9}
		);		
	}
	
	const machineGun = setInterval(() => {
	
		TARGET_CONTRACTS
		.filter(v => !CONTRACTS_TRADED.includes(v.address))
		.forEach(async (trade) => await startSniper(trade));
		
	}, 1000);	
	
	webSocketProvider._websocket.on('open', () => {
		
		keepAliveInterval = setInterval(() => {
	
			webSocketProvider._websocket.ping();
			
			pingTimeout = setTimeout(() => { 
				webSocketProvider._websocket.terminate()
			}, EXPECTED_PONG_BACK);
		  
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
			
			const trade = TARGET_CONTRACTS
			.filter(o => !CONTRACTS_TRADED.includes(o.address))
			.find(o => o.address === tokenOut);
			
			if(typeof trade === 'object')
			{
				console.log(`Listed ${tokenOut}`);
				
				notifier.notify({
					title: 'Contract Listed!',
					message: tokenOut,
					open: `https://bscscan.com/token/${tokenOut}`
				});				

				await startSniper(trade);	
			}
		});

	});

	const startSniper = async (trade) => {

		let {code, address: tokenOut, maximumPriceAccepted, sellAmountInBusd} = trade;
		
		CONTRACTS_TRADED.push(tokenOut);
		
		const pair = await rpcFactory.getPair(SELL_TOKEN, tokenOut);
		
		if(pair === '0x0000000000000000000000000000000000000000')
		{
			console.log(`--- No Liquidity in ${code} ---`);

			if (CONTRACTS_TRADED.indexOf(tokenOut) > -1) 
			{
				//removing token from CONTRACTS_TRADED
				CONTRACTS_TRADED.splice(CONTRACTS_TRADED.indexOf(tokenOut), 1);
			}					
			
			return;
		}
	
		let rpcBuyContract = new ethers.Contract(
			tokenOut, 
			['function decimals() view returns (uint8)'], 
			rpcSigner
		);	
		
		const buyTokenDecimals = await rpcBuyContract.decimals();
		const oneTokenAmount = ethers.utils.parseUnits('1', buyTokenDecimals);
		const amountIn = ethers.utils.parseUnits(
			(sellAmountInBusd * ((100 - SLIPPAGE_TOLERANCE) / 100)).toString(),
			sellTokenDecimals
		);
		const amountsOut = await rpcRouter.getAmountsOut(amountIn, [SELL_TOKEN, tokenOut]);
		
		Promise.all([
			rpcRouter.getAmountsOut(amountIn, [SELL_TOKEN, tokenOut]),
			rpcRouter.getAmountsOut(oneTokenAmount, [tokenOut, addresses.BUSD])
		]).then(async (arr) => {
			
			let [
				amountsOut, 
				oneTokenInBusd
			] = arr;
			
			amountsOut = amountsOut[1];
			oneTokenInBusd = oneTokenInBusd[1];
			const oneTokenInBusdFormated = ethers.utils.formatUnits(oneTokenInBusd.toString(), buyTokenDecimals);
			
			//console.log({oneTokenInBusd: oneTokenInBusdFormated});
			
			maximumPriceAccepted = ethers.utils.parseUnits(maximumPriceAccepted.toString(), buyTokenDecimals);
			
			if(oneTokenInBusd.gt(maximumPriceAccepted))
			{
				if (CONTRACTS_TRADED.indexOf(tokenOut) > -1) 
				{
					//removing token from CONTRACTS_TRADED
					CONTRACTS_TRADED.splice(CONTRACTS_TRADED.indexOf(tokenOut), 1);
				}			
				console.log(`${code} too expensive: ${oneTokenInBusdFormated}`);
				return;
			}
			else
			{
				clearInterval(machineGun);
				console.log(`Buying ${code} for: ${oneTokenInBusdFormated}`);
			}
			
			

			if(!IS_PRODUCTION)
			{
				return;
			}

			const deadline = Math.floor(Date.now() / 1000) + 60 * DEADLINE_MINUTES;
			
			// Execute transaction
			const tx = await rpcRouter.swapExactTokensForTokens(
				ethers.utils.parseUnits(sellAmountInBusd.toString(), sellTokenDecimals),
				amountsOut,
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
		});
		
	}; 
	
	webSocketProvider._websocket.on('close', () => {
		console.log('Restaring Websocket');
		clearInterval(keepAliveInterval);
		clearTimeout(pingTimeout);
		startConnection();
	});

	webSocketProvider._websocket.on('pong', () => {
		console.log('Websocket Active');
		clearInterval(pingTimeout);
	});	
	
};

startConnection();