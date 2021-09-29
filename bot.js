import {walletPrivateKey, walletAddress, webSocketEndpoint} from './secrets.js';
import {getAddresses} from './config.js';
import {openPancakeSwap, openBscScan, bscScanUrl, getTargetContracts} from './utilities.js';
import { ethers } from 'ethers';
import {JsonRpcProvider} from '@ethersproject/providers';
import open from 'open';
import notifier from 'node-notifier';

const {getAddress, formatUnits, parseUnits, hexlify, formatEther, parseEther} = ethers.utils;

const IS_PRODUCTION = false;
const addresses = getAddresses();
let SELL_TOKEN = getAddress(addresses.BUSD);
let TARGET_CONTRACTS = await getTargetContracts();

//CONFIGS
const DEADLINE_MINUTES = 5; // >= 1
let CONTRACTS_TRADED = {};
const APPROVE_MAX_TRANSACTIONS = TARGET_CONTRACTS.reduce((accumulator, o) => accumulator + o.saleAmount, 0);

const startConnection = async () => {

	const rpcProvider = new JsonRpcProvider('https://bsc-dataseed1.binance.org/');
	const wallet = new ethers.Wallet(walletPrivateKey, rpcProvider);
	const rpcSigner = wallet.connect(rpcProvider);
	const EXPECTED_PONG_BACK = 15000;
	const KEEP_ALIVE_CHECK_INTERVAL = 7500;
	const SNIPER_INTERVAL = (IS_PRODUCTION) ? 200 : 5000;
	let pingTimeout = null;
	let keepAliveInterval = null;
		
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
			'function getPair(address tokenA, address tokenB) external view returns (address pair)',
			'event PairCreated(address indexed token0, address indexed token1, address pair, uint)'
		],
		rpcSigner
	);
	
	let rpcSellContract = new ethers.Contract(
		SELL_TOKEN, 
		[
			'function approve(address _spender, uint256 _value) public returns (bool success)',
			'function decimals() view returns (uint8)',
			'function balanceOf(address owner) view returns (uint256)',
			'function symbol() view returns (string)'
		], 
		rpcSigner
	);
	
	const sellTokenDecimals = await rpcSellContract.decimals();
	
	if(IS_PRODUCTION)
	{
		await rpcSellContract.approve(
			addresses.ROUTER, 
			parseUnits(APPROVE_MAX_TRANSACTIONS.toString(), sellTokenDecimals), 
			{gasLimit: 100000, gasPrice: 5e9}
		);		
	}
	
	rpcFactory.on('PairCreated', async (token0, token1, pairAddress) => {
		
		token0 = getAddress(token0);
		token1 = getAddress(token1);
		
		let trade = TARGET_CONTRACTS
		.find(o => o.address === token0) || TARGET_CONTRACTS.find(o => o.address === token1);

		//The quote currency is not WBNB
		if(typeof trade === 'undefined') {
			return;
		}
		
		const {address: tokenOut} = trade;
				
		notifier.notify({
			title: 'Contract Listed!',
			message: tokenOut,
			open: `https://bscscan.com/token/${tokenOut}`
		});
		
		snipeContract({
			...trade,
			pairAddress,
			tokenIn: (token0 === trade.address) ? token1 : token0
		});
		
		console.log(`

		+++++++++++++++++++++++++++++++++++++++++++++++++++++
		-- New Pair --
		token0: ${token0}
		token1: ${token1}
		pairAddress: ${pairAddress}
		+++++++++++++++++++++++++++++++++++++++++++++++++++++

		`);			
	});

	const snipeContract = async (trade) => {

		let {
			code, 
			address: tokenOut,
			maxPurchasePrice,
			forceSwapToMaxPurchasePrice,
			saleAmount,
			tokenIn,
			pairAddress,
			slippage,
			deadlineMinutes
		} = trade;
				
		const pancakeSwapParams = {
			inputCurrency: SELL_TOKEN, 
			outputCurrency: tokenOut, 
			slippage, 
			exactAmount: saleAmount
		};
		
		if(!CONTRACTS_TRADED.hasOwnProperty(tokenOut))
		{
			CONTRACTS_TRADED[tokenOut] = {failedOnce: false};
		}
		
		CONTRACTS_TRADED[tokenOut].trading = true;
		
		const pair = await rpcFactory.getPair(SELL_TOKEN, tokenOut);
		
		if(pair === '0x0000000000000000000000000000000000000000' && !forceSwapToMaxPurchasePrice)
		{
			console.log(`--- No Liquidity in ${code}: ${tokenOut} ---`);
			
			if(tokenIn)
			{
				console.log(`--- tokenIn ${tokenIn} ---`);
			}
			if(pairAddress)
			{
				console.log(`--- pairAddress ${pairAddress} ---`);
			}

			CONTRACTS_TRADED[tokenOut].trading = false;

			if(!CONTRACTS_TRADED[tokenOut].failedOnce) 
			{
				await openPancakeSwap(pancakeSwapParams);
				CONTRACTS_TRADED[tokenOut].failedOnce = true;
			}
			
			return;
		}
		
		CONTRACTS_TRADED[tokenOut].failedOnce = false;
	
		let rpcBuyContract = new ethers.Contract(
			tokenOut, 
			[
				'function decimals() view returns (uint8)',
				'function balanceOf(address owner) view returns (uint256)'
			], 
			rpcSigner
		);	

		//const buyTokenDecimals = await rpcBuyContract.decimals();
		const oneTokenAmount = parseEther('1');
		const getTokensOut = (!forceSwapToMaxPurchasePrice) ? await rpcRouter.getAmountsOut(oneTokenAmount, [tokenOut, addresses.BUSD]) : [null, parseEther(maxPurchasePrice.toString())];
			
		let oneTokenInBusd = getTokensOut[1];
		
		const oneTokenInBusdFormated = formatEther(oneTokenInBusd.toString());
		let amountsOut = (saleAmount / parseFloat(oneTokenInBusdFormated)) * ((100 - slippage) / 100);
		amountsOut = parseEther(amountsOut.toString());
		
		console.log(`--- Quote ${saleAmount} tokenOut - ${slippage}% slippage = ${formatEther(amountsOut)} ${code} ---`);
		
		maxPurchasePrice = parseEther(maxPurchasePrice.toString());
		
		if(oneTokenInBusd.gt(maxPurchasePrice) && !forceSwapToMaxPurchasePrice)
		{
			CONTRACTS_TRADED[tokenOut].trading = false;
			console.log(`--- ${code} too expensive: ${oneTokenInBusdFormated} ---`);
			return;
		}
		else
		{
			console.log(`+++ Buying ${code} for: ${oneTokenInBusdFormated} +++`);
		}
		
		console.log('+++ saleAmount ' + formatEther(parseEther(saleAmount.toString())) + ' +++');
		console.log('+++ amountsOut ' + formatEther(amountsOut) + ' +++');
		
		if(!IS_PRODUCTION)
		{
			return;
		}
		
		try{
			const deadline = Math.floor(Date.now() / 1000) + 60 * deadlineMinutes;
			
			// Execute transaction
			const tx = await rpcRouter.swapExactTokensForTokens(
				parseEther(saleAmount.toString()),
				amountsOut,
				[SELL_TOKEN, tokenOut],
				walletAddress,
				deadline,
				{ 
					gasLimit: hexlify(200000), 
					gasPrice: parseUnits('10', 'gwei') 
				}
			);
			
			console.log(`Tx-hash: ${tx.hash}`);
			
			const receipt = await tx.wait();
			const tradeUrl = `https://bscscan.com/tx/${tx.hash}`;
			
			notifier.notify({
				title: 'Transaction Submited!',
				message: `Hash: ${tx.hash}`,
				open: tradeUrl
			});

			if(receipt)
			{
				if(receipt.status)
				{
					console.log({receiptKeys: Object.keys(receipt)});
					let tokenOutBalance = await rpcBuyContract.balanceOf(walletAddress);
					let tokenInBalance = await rpcSellContract.balanceOf(walletAddress);
					let tokenInSymbol = await rpcSellContract.symbol(walletAddress);
					
					if(tokenOutBalance && tokenInBalance && tokenInSymbol)
					{
						tokenOutBalance = formatEther(tokenOutBalance);
						tokenInBalance = formatEther(tokenInBalance);
						console.log(`*** Transaction Successful: ${tx.hash} ***`);
						console.log(`*** ${code} Balance ${tokenOutBalance} ***`);
						console.log(`*** ${tokenInSymbol} Balance ${tokenInBalance} ***`);
					}	
				}
				else
				{
					console.log(`Transaction Failed: ${tx.hash}`);
					await openPancakeSwap(pancakeSwapParams);
				}
			}
			
			await openBscScan(tx.hash);
		}
		catch(e) {
			
			const {transactionHash} = e;
			await openPancakeSwap(pancakeSwapParams);
						
			notifier.notify({
				title: 'Transaction Failed!',
				message: `Hash: ${transactionHash}`,
				open: `${bscScanUrl}${transactionHash}`
			});

			await openBscScan(transactionHash);
		}

	};
	
	const startSniper = () => {
		TARGET_CONTRACTS
		.filter(o => {
			if(!CONTRACTS_TRADED.hasOwnProperty(o.address))
			{
				return o;
			}
			else
			{
				if(!CONTRACTS_TRADED[o.address].trading)
				{
					return o;
				}
			}
		})
		.forEach(trade => snipeContract(trade));		
	};
	
	setInterval(() => startSniper(), SNIPER_INTERVAL);
	
	setInterval(async () => {
		
		const data = await getTargetContracts();
		
		if(data)
		{
			data.forEach(o => {

				let previousTargets = TARGET_CONTRACTS
					.find(i => i.address === o.address);
				
				if(typeof previousTargets === 'object')
				{
					const updatedJson = JSON.stringify(o);
					previousTargets = JSON.stringify(previousTargets);
					
					if(!CONTRACTS_TRADED.hasOwnProperty(o.address))
					{
						CONTRACTS_TRADED[o.address] = {};
					}
					
					if(previousTargets !== updatedJson)
					{
						CONTRACTS_TRADED[o.address].trading = false;
					}					
				}
				
			});
			
			TARGET_CONTRACTS = data;
		}
		
	}, 4000);
	
	startSniper();
};

startConnection();