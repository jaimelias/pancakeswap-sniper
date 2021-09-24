import {privateKey, publicKey} from './secrets.js';
import {addresses} from './config.js';
import { ethers } from 'ethers';
import {JsonRpcProvider} from '@ethersproject/providers';
import open from 'open';
import notifier from 'node-notifier';

const SELL_AMOUNT = 1;
let SELL_TOKEN = addresses.BUSD;
let BUY_TOKEN = '0x9fd87aefe02441b123c3c32466cd9db4c578618f';
const SLIPPAGE_TOLERANCE = 0.5; //RANGE 0.01% - 49%
const DEADLINE_MINUTES = 5; // >= 1
const APPROVE_MAX_TRANSACTIONS = SELL_AMOUNT * 1; //any number larger than SELL_AMOUNT

const rpcProvider = new JsonRpcProvider('https://bsc-dataseed1.binance.org/');
const wallet = new ethers.Wallet(privateKey, rpcProvider);
const rpcSigner = wallet.connect(rpcProvider);

const startConnection = async () => {
	
	BUY_TOKEN = ethers.utils.getAddress(BUY_TOKEN);
	SELL_TOKEN = ethers.utils.getAddress(SELL_TOKEN);	
	
	const factory = new ethers.Contract(
		addresses.FACTORY,
		[
			'event PairCreated(address indexed token0, address indexed token1, address pair, uint)',
			'function getPair(address tokenA, address tokenB) external view returns (address pair)'
		],
		rpcSigner
	);	
	
	const rPcRouter = new ethers.Contract(
	  addresses.ROUTER,
	  [
		'function getAmountsOut(uint amountIn, address[] memory path) public view returns (uint[] memory amounts)'
	  ],
	  rpcSigner
	);
	
	const pair = await factory.getPair(addresses.BUSD, BUY_TOKEN);
	let amountIn = (SELL_AMOUNT * ((100 - SLIPPAGE_TOLERANCE) / 100)).toString();
	amountIn = ethers.utils.parseUnits(amountIn.toString(), 18);
	const amountsOut = await rPcRouter.getAmountsOut(amountIn, [SELL_TOKEN, BUY_TOKEN]);
	
	const amountOutMin = amountsOut[1];

	console.log({amountOutMin: ethers.utils.formatUnits(amountOutMin.toString(), 'ether')});
	
	let contract = new ethers.Contract(
		SELL_TOKEN, 
		["function approve(address _spender, uint256 _value) public returns (bool success)"], 
		rpcSigner
	);
	
	await contract.approve(
		addresses.ROUTER, 
		ethers.utils.parseUnits(APPROVE_MAX_TRANSACTIONS.toString(), 18), 
		{gasLimit: 100000, gasPrice: 5e9}
	);
	
	const router = new ethers.Contract(
		addresses.ROUTER,
		[
			'function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)'
		],
		rpcSigner
	);	
	
	const deadline = Math.floor(Date.now() / 1000) + 60 * DEADLINE_MINUTES;	
	
	// Execute transaction
	const tx = await router.swapExactTokensForTokens(
		ethers.utils.parseUnits(SELL_AMOUNT.toString(), 18),
		amountOutMin,
		[SELL_TOKEN, BUY_TOKEN],
		publicKey,
		deadline,
		{ 
			gasLimit: ethers.utils.hexlify(200000), 
			gasPrice: ethers.utils.parseUnits('10', 'gwei') 
		}
	)

	console.log(`Tx-hash: ${tx.hash}`)

	const receipt = await tx.wait();
	const tradeUrl = `https://bscscan.com/tx/${tx.hash}`;
	
	await open(tradeUrl);
	
	notifier.notify({
		title: 'Transaction Confirmed!',
		message: `Hash: ${tx.hash}`,
		open: tradeUrl
	});	

	//console.log(receipt);
};

startConnection();