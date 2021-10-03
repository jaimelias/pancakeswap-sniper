import {walletPrivateKey, walletAddress} from './secrets.js';
import {getExchange} from './config.js';
import {openDex, openExplorer, getTargetContracts} from './utilities.js';
import { ethers } from 'ethers';
import {JsonRpcProvider} from '@ethersproject/providers';
import notifier from 'node-notifier';

const IS_PRODUCTION = false;
const exchange = 'QUICKSWAP';
const exchangeConfig = getExchange(exchange);
const {CONFIG} = exchangeConfig;
const {RPC_NETWORK, GAS, EXPLORER, DEX} = CONFIG;
let {STABLE, WRAPPED, ALT_1} = CONFIG;
STABLE = exchangeConfig[STABLE];
WRAPPED = exchangeConfig[WRAPPED];
ALT_1 = exchangeConfig[ALT_1];
const {utils, BigNumber} = ethers;
const {getAddress, formatUnits, parseUnits} = utils;
let SELL_TOKEN = getAddress(ALT_1);
let TARGET_CONTRACTS = await getTargetContracts();

//CONFIGS
let CONTRACTS_TRADED = {};
const APPROVE_MAX_TRANSACTIONS = TARGET_CONTRACTS.reduce((accumulator, o) => accumulator + o.saleAmount, 0);
const dummyAddress = '0x0000000000000000000000000000000000000000';

const startConnection = async () => {

	const rpcProvider = new JsonRpcProvider(RPC_NETWORK);
	const wallet = new ethers.Wallet(walletPrivateKey, rpcProvider);
	const rpcSigner = wallet.connect(rpcProvider);
	const SNIPER_INTERVAL = (IS_PRODUCTION) ? 1000 : 5000;

	const rpcRouter = new ethers.Contract(
		exchangeConfig.ROUTER,
		[
			'function getAmountsOut(uint amountIn, address[] memory path) public view returns (uint[] memory amounts)',
			'function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)'
		],
		rpcSigner
	);

	const rpcFactory = new ethers.Contract(
		exchangeConfig.FACTORY,
		[
			'function getPair(address tokenA, address tokenB) external view returns (address pair)',
			'event PairCreated(address indexed token0, address indexed token1, address pair, uint)'
		],
		rpcSigner
	);
	
	let rpcInContract = new ethers.Contract(
		SELL_TOKEN, 
		[
			'function approve(address _spender, uint256 _value) public returns (bool success)',
			'function decimals() view returns (uint8)',
			'function balanceOf(address owner) view returns (uint256)'
		], 
		rpcSigner
	);
	
	const tokenInDecimals = await rpcInContract.decimals();
	
	if(IS_PRODUCTION)
	{
		await rpcInContract.approve(
			exchangeConfig.ROUTER, 
			parseUnits(APPROVE_MAX_TRANSACTIONS.toString(), tokenInDecimals), 
			GAS.APPROVE
		);		
	}
	
	rpcFactory.on('PairCreated', async (token0, token1, pairAddress) => {
		
		console.log({token0, token1, pairAddress});
		
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
			open: `${EXPLORER}/token/${tokenOut}`
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
			exactAmount: saleAmount,
			DEX
		};
		
		if(!CONTRACTS_TRADED.hasOwnProperty(tokenOut))
		{
			CONTRACTS_TRADED[tokenOut] = {failedOnce: false};
		}
		
		CONTRACTS_TRADED[tokenOut].trading = true;
		
		let pair = [];
		
		if(tokenOut !== WRAPPED)
		{
			pair.push(await rpcFactory.getPair(WRAPPED, tokenOut));
		}
		
		if(tokenOut !== STABLE)
		{
			pair.push(await rpcFactory.getPair(STABLE, tokenOut));
		}

		
		if(tokenOut !== ALT_1)
		{
			pair.push(await rpcFactory.getPair(ALT_1, tokenOut));
		}	
			
		const hasLiquidity = val => val === dummyAddress;
		
		if(pair.every(hasLiquidity))
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
				CONTRACTS_TRADED[tokenOut].failedOnce = true;
				await openDex(pancakeSwapParams);
			}
			
			return;
		}
		
		CONTRACTS_TRADED[tokenOut].failedOnce = false;
	
		//INSERT
		
		const {rpcOutContract, tokenOutDecimals} = CONTRACTS_TRADED[tokenOut];
		
		let oneToken = (1).toFixed(tokenInDecimals).toString();
		oneToken = parseUnits(oneToken, tokenInDecimals);
		
		let slippedAmount = saleAmount * ((100 - slippage) / 100);
		slippedAmount = slippedAmount.toFixed(tokenInDecimals).toString();
		slippedAmount = parseUnits(slippedAmount, tokenInDecimals);
		const slippedAmountFormated = parseFloat(formatUnits(slippedAmount, tokenOutDecimals));
		
		let oneAmountOut = await rpcRouter.getAmountsOut(oneToken, [SELL_TOKEN, tokenOut]);
		oneAmountOut = oneAmountOut[1];
		const oneAmountOutFormated = parseFloat(formatUnits(oneAmountOut, tokenOutDecimals));		
		const pricePerToken = 1 / oneAmountOutFormated;
		
		let amountsOut = (oneAmountOutFormated * slippedAmountFormated).toFixed(tokenOutDecimals);
		amountsOut = parseUnits(amountsOut, tokenOutDecimals);
		const amountsOutFormated = parseFloat(formatUnits(amountsOut, tokenOutDecimals));

		if(!IS_PRODUCTION)
		{
			console.log({
				oneToken: formatUnits(oneToken, tokenInDecimals),
				slippedAmount: formatUnits(slippedAmount, tokenInDecimals),
				oneAmountOut: formatUnits(oneAmountOut, tokenOutDecimals),
				amountsOut: formatUnits(amountsOut, tokenOutDecimals)
			});			
		}

		if(maxPurchasePrice)
		{
			if(pricePerToken > maxPurchasePrice)
			{
				CONTRACTS_TRADED[tokenOut].trading = false;
				console.log(`--- ${code} too expensive: ${pricePerToken} per token ---`);

				return;
			}			
		}
		
		console.log(`+++ Buying ${amountsOutFormated} ${code} at ${pricePerToken} each +++`);
		console.log(`-- Selling ${saleAmount} tokens --`);
		
		if(!IS_PRODUCTION)
		{
			return;
		}
		
		try{
			const deadline = Math.floor(Date.now() / 1000) + 60 * deadlineMinutes;
			
			// Execute swap
			const tx = await rpcRouter.swapExactTokensForTokens(
				parseUnits(saleAmount.toString(), tokenOutDecimals),
				amountsOut,
				[SELL_TOKEN, tokenOut],
				walletAddress,
				deadline,
				GAS.SWAP
			);
			
			console.log(`Tx-hash: ${tx.hash}`);
			
			const receipt = await tx.wait();
			const tradeUrl = `${EXPLORER}/tx/${tx.hash}`;
			
			notifier.notify({
				title: 'Transaction Submited!',
				message: `Hash: ${tx.hash}`,
				open: tradeUrl
			});

			if(receipt)
			{
				if(receipt.status)
				{
					let tokenOutBalance = await rpcOutContract.balanceOf(walletAddress);
					
					if(tokenOutBalance)
					{
						tokenOutBalance = formatUnits(tokenOutBalance, tokenOutDecimals);
						console.log(`*** Transaction Successful: ${tx.hash} ***`);
						console.log(`*** ${code} Balance ${tokenOutBalance} ***`);
					}	
				}
				else
				{
					console.log(`Transaction Failed: ${tx.hash}`);
					await openDex(pancakeSwapParams);
				}
			}
			
			await openExplorer({hash: tx.hash, EXPLORER});
		}
		catch(e) {
			
			const {transactionHash} = e;
			await openDex(pancakeSwapParams);
						
			notifier.notify({
				title: 'Transaction Failed!',
				message: `Hash: ${transactionHash}`,
				open: `${EXPLORER}/tx/${transactionHash}`
			});

			await openExplorer({hash: transactionHash, EXPLORER});
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
		.forEach(async (trade) => {
			
			const {address: tokenOut} = trade;
			
			if(!CONTRACTS_TRADED.hasOwnProperty(tokenOut))
			{
				let rpcOutContract = new ethers.Contract(
					tokenOut, 
					[
						'function decimals() view returns (uint8)',
						'function balanceOf(address owner) view returns (uint256)'
					], 
					rpcSigner
				);	
			
				const tokenOutDecimals = (tokenOut === dummyAddress) 
					? 18 
					: await rpcOutContract.decimals();
				
				CONTRACTS_TRADED[tokenOut] = {
					rpcOutContract, 
					tokenOutDecimals,
					failedOnce: false,
					trading: false
				};				
			}
			
			snipeContract(trade);
		});		
	};
	
	if(SNIPER_INTERVAL)
	{
		setInterval(() => startSniper(), SNIPER_INTERVAL);
	}
	
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
		
	}, 2000);
	
	startSniper();
};

startConnection();