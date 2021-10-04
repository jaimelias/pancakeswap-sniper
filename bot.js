import {walletPrivateKey, walletAddress} from './secrets.js';
import {getExchange} from './config.js';
import {openDex, openExplorer, getTargetContracts, dummyAddress, logNewPair} from './utilities.js';
import { ethers } from 'ethers';
import {JsonRpcProvider} from '@ethersproject/providers';
import notifier from 'node-notifier';

const IS_PRODUCTION = false;
const exchange = 'PANCAKESWAP';
const exchangeConfig = getExchange(exchange);
const {CONFIG} = exchangeConfig;
const {RPC_NETWORK, GAS, EXPLORER, DEX} = CONFIG;
const {getAddress, formatUnits, parseUnits} = ethers.utils;
let TARGET_CONTRACTS = await getTargetContracts();

//CONFIGS
let CONTRACTS_TRADED = {};
let TRADES_APPROVED = {};

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
	
	rpcFactory.on('PairCreated', async (token0, token1, pairAddress) => {
		
		token0 = getAddress(token0);
		token1 = getAddress(token1);
				
		let trade = TARGET_CONTRACTS.find(o => o.tokenOut === token0 && o.tokenIn === token1) || TARGET_CONTRACTS.find(o => o.tokenOut === token1 && o.tokenIn === token0);

		//The quote currency is not WBNB
		if(typeof trade === 'undefined') {
			return;
		}
		
		logNewPair({token0, token1, pairAddress});
		
		const {tokenOut} = trade;
				
		notifier.notify({
			title: 'Contract Listed!',
			message: tokenOut,
			open: `${EXPLORER}/token/${tokenOut}`
		});
		
		snipeContract({
			...trade,
			pairAddress,
			tokenIn: (token0 === tokenOut) ? token1 : token0
		});		
	});

	const snipeContract = async (trade) => {

		let {
			tokenOut,
			maxPurchasePrice,
			tokenInAmount,
			tokenIn,
			pairAddress,
			slippage,
			deadlineMinutes
		} = trade;
				
		const pancakeSwapParams = {
			inputCurrency: tokenIn, 
			outputCurrency: tokenOut, 
			slippage, 
			exactAmount: tokenInAmount,
			DEX
		};
		
		if(!CONTRACTS_TRADED.hasOwnProperty(tokenOut))
		{
			CONTRACTS_TRADED[tokenOut] = {failedOnce: false};
		}
		
		CONTRACTS_TRADED[tokenOut].trading = true;
		
		pairAddress = (!pairAddress) ?  await rpcFactory.getPair(tokenIn, tokenOut) : pairAddress;
			
		if(pairAddress === dummyAddress)
		{
			console.log(`--- No Liquidity in ${tokenOut} ---`);

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
		
		const {rpcInContract, tokenInDecimals, rpcOutContract, tokenOutDecimals} = CONTRACTS_TRADED[tokenOut];
		
		let oneToken = (1).toFixed(tokenInDecimals).toString();
		oneToken = parseUnits(oneToken, tokenInDecimals);
		
		let slippedAmount = tokenInAmount * ((100 - slippage) / 100);
		slippedAmount = slippedAmount.toFixed(tokenInDecimals).toString();
		slippedAmount = parseUnits(slippedAmount, tokenInDecimals);
		const slippedAmountFormated = parseFloat(formatUnits(slippedAmount, tokenOutDecimals));
		
		let oneAmountOut = await rpcRouter.getAmountsOut(oneToken, [tokenIn, tokenOut]);
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
				console.log(`--- ${tokenOut} too expensive: ${pricePerToken} per token ---`);

				return;
			}			
		}
		
		console.log(`+++ Buying ${amountsOutFormated} ${tokenOut} at ${pricePerToken} each +++`);
		console.log(`-- Selling ${tokenInAmount} ${tokenIn} --`);
				
		if(!IS_PRODUCTION)
		{
			return;
		}
		
		try{
			const deadline = Math.floor(Date.now() / 1000) + 60 * deadlineMinutes;
			
			// Execute swap
			const tx = await rpcRouter.swapExactTokensForTokens(
				parseUnits(tokenInAmount.toString(), tokenOutDecimals),
				amountsOut,
				[tokenIn, tokenOut],
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
						console.log(`*** ${tokenOut} Balance ${tokenOutBalance} ***`);
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
			if(!CONTRACTS_TRADED.hasOwnProperty(o.tokenOut))
			{
				return o;
			}
			else
			{
				if(!CONTRACTS_TRADED[o.tokenOut].trading)
				{
					return o;
				}
			}
		})
		.forEach(async (trade) => {
			
			const {tokenOut, tokenIn} = trade;
			
			if(!CONTRACTS_TRADED.hasOwnProperty(tokenOut))
			{
				
				let rpcInContract = new ethers.Contract(
					tokenIn, 
					[
						'function approve(address _spender, uint256 _value) public returns (bool success)',
						'function decimals() view returns (uint8)',
						'function balanceOf(address owner) view returns (uint256)'
					], 
					rpcSigner
				);
				
				
				const tokenInDecimals = (tokenOut === dummyAddress) ? 18 : await rpcInContract.decimals();
				
				const approveAmount = TARGET_CONTRACTS
				.filter(o => o.tokenIn === tokenIn)
				.reduce((accumulator, o) => accumulator + o.tokenInAmount, 0);

				TRADES_APPROVED[tokenIn] = approveAmount;				
				
				if(IS_PRODUCTION)
				{
					await rpcInContract.approve(
						exchangeConfig.ROUTER, 
						parseUnits(approveAmount.toString(), tokenInDecimals), 
						GAS.APPROVE
					);		
				}
				
				let rpcOutContract = new ethers.Contract(
					tokenOut, 
					[
						'function decimals() view returns (uint8)',
						'function balanceOf(address owner) view returns (uint256)'
					], 
					rpcSigner
				);	
			
				
				const tokenOutDecimals = (tokenOut === dummyAddress) ? 18 : await rpcOutContract.decimals();
				
				CONTRACTS_TRADED[tokenOut] = {
					rpcInContract,
					tokenInDecimals,
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
			data.forEach(async (o) => {

				const {tokenOut, tokenIn} = o;

				let previousTargets = TARGET_CONTRACTS
					.find(i => i.tokenOut === tokenOut);
				
				if(typeof previousTargets === 'object')
				{
					const updatedJson = JSON.stringify(o);
					previousTargets = JSON.stringify(previousTargets);
					
					if(!CONTRACTS_TRADED.hasOwnProperty(tokenOut))
					{
						CONTRACTS_TRADED[tokenOut] = {};
					}
					
					if(previousTargets !== updatedJson)
					{
						const approveAmount = data.filter(i => i.tokenIn === tokenIn)
						.reduce((accumulator, i) => accumulator + i.tokenInAmount, 0);
						

						if(TRADES_APPROVED[tokenIn] !== approveAmount)
						{
							const {rpcInContract, tokenInDecimals} = CONTRACTS_TRADED[tokenOut];
														
							TRADES_APPROVED[tokenIn] = approveAmount;
							
							if(IS_PRODUCTION)
							{
								await rpcInContract.approve(
									exchangeConfig.ROUTER, 
									parseUnits(approveAmount.toString(), tokenInDecimals), 
									GAS.APPROVE
								);								
							}
						}
						
						CONTRACTS_TRADED[tokenOut].trading = false;
					}					
				}
				
			});
			
			TARGET_CONTRACTS = data;
		}
		
	}, 2000);
	
	startSniper();
};

startConnection();