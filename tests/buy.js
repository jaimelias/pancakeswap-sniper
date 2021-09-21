import {privateKey} from '../secrets.js';
import {webSocketEndpoint, addresses} from '../config.js';
import { ethers } from 'ethers';
import {ChainId, Token, TokenAmount, Fetcher, Route, Trade, TradeType, Percent, WETH, Pair} from '@pancakeswap-libs/sdk';
import {JsonRpcProvider} from '@ethersproject/providers';
import Web3 from 'web3';

const BUY_TOKEN = ethers.utils.getAddress('0x9fd87aefe02441b123c3c32466cd9db4c578618f');
const wallet = new ethers.Wallet(Buffer.from(privateKey, 'hex'));
const rpcProvider = new JsonRpcProvider('https://bsc-dataseed1.binance.org/');
const rpcSigner = wallet.connect(rpcProvider);
const web3 = new Web3(webSocketEndpoint);
const { address: admin } = web3.eth.accounts.wallet.add(privateKey);
const chainId = ChainId.MAINNET;
const ONE_ETH_IN_WEI = web3.utils.toBN(web3.utils.toWei('1'));
const tradeAmount = ONE_ETH_IN_WEI.div(web3.utils.toBN('1000'));


const startConnection = async () => {
	
	
	const OUTPUT = await Fetcher.fetchTokenData(chainId, BUY_TOKEN, rpcProvider);
	const INPUT = WETH[chainId];	
	
	// Create Pancakeswap ethers Contract
	const routerContract = new ethers.Contract(
		addresses.ROUTER,
		[
			'function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)'
		],
		rpcSigner
	);
	
	const factoryContract = new ethers.Contract(
	  addresses.FACTORY,
	  ['function getPair(address tokenA, address tokenB) external view returns (address pair)'],
	  rpcSigner
	);
	
	const thisPair = await factoryContract.getPair(INPUT.address, OUTPUT.address);
		
	const pair = await Fetcher.fetchPairData(INPUT, OUTPUT, rpcProvider);
	
	//console.log({OUTPUT, INPUT, pair});
	
	const route = new Route([pair], INPUT);
	const trade = new Trade(route, new TokenAmount(INPUT, tradeAmount), TradeType.EXACT_INPUT);
	const slippageTolerance = new Percent('50', '10000');
	
	// create transaction parameters
	const amountOutMin = trade.minimumAmountOut(slippageTolerance).raw
	const path = [INPUT.address, OUTPUT.address]
	const to = admin;
	const minutes = 5;
	const deadline = Math.floor(Date.now() / 1000) + 60 * minutes;




	// Allow Pancakeswap

	let contract = new ethers.Contract(
		INPUT.address, 
		["function approve(address _spender, uint256 _value) public returns (bool success)"], 
		rpcSigner
	)
	
	await contract.approve(addresses.ROUTER, ethers.utils.parseUnits('1000.0', 18), {gasLimit: 100000, gasPrice: 5e9});
		
	/*// Execute transaction
	const tx = await routerContract.swapExactTokensForTokens(
		ethers.utils.parseUnits('0.001', 18),
		ethers.utils.parseUnits(web3.utils.fromWei(amountOutMin.toString()), 18),
		path,
		to,
		deadline,
		{ gasLimit: ethers.utils.hexlify(200000), gasPrice: ethers.utils.parseUnits("10", "gwei") }
	)

	console.log(`Tx-hash: ${tx.hash}`)

	const receipt = await tx.wait();

	console.log(`Tx was mined in block: ${receipt.blockNumber}`);*/

	
};

await startConnection();