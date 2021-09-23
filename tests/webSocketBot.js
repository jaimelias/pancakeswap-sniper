let script = document.createElement('script');
script.type = 'text/javascript';
script.src = 'https://jaimelias.com/ethers-5.0.umd.min.js';
document.head.appendChild(script);

/*
####### #     # ####### ####### ######  
#       ##    #    #    #       #     # 
#       # #   #    #    #       #     # 
#####   #  #  #    #    #####   ######  
#       #   # #    #    #       #   #   
#       #    ##    #    #       #    #  
####### #     #    #    ####### #     # 
*/

//EDIT FROM HERE
const BNB_AMOUNT = 2;
let BUY_TOKEN = '0x01e0d17a533e5930a349c2bb71304f04f20ab12b';
const RECIPIENT_WALLET = '0xAb88E902Ae4a49Db58d9D953Fbe59efd00512DC5';
const MIN_TOKENS_TO_RECEIVE = 0;
const IS_INFLATORY = true;
const TRADE_DURATION_IN_MINUTES = 2;
//EDIT UNTIL HERE

const webSocketEndpoint = 'wss://apis.ankr.com/wss/7d0fec2599a34071a6a84bdb6844419a/afd5383e7cd99981f23f6b9cbcdacd35/binance/full/main';
const EXPECTED_PONG_BACK = 15000;
const KEEP_ALIVE_CHECK_INTERVAL = 7500;

let addresses = {
  WBNB: '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c',
  FACTORY: '0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73',
};

const thisFunction = (IS_INFLATORY) ? 'swapExactETHForTokens' : 'swapExactETHForTokensSupportingFeeOnTransferTokens';
const thisFunctionNumber = (IS_INFLATORY) ? '10' : '11';

const {contentWindow} = document.getElementById('writecontractiframe');

const iframeDocument = contentWindow.document;

let payableAmountField = iframeDocument.getElementById(`input_payable_${thisFunctionNumber}_${thisFunction}`);
let amountOutMinField = iframeDocument.getElementById(`input_${thisFunctionNumber}_1`);
let pathField = iframeDocument.getElementById(`input_${thisFunctionNumber}_2`);
let toField = iframeDocument.getElementById(`input_${thisFunctionNumber}_3`);
let deadlineField = iframeDocument.getElementById(`input_${thisFunctionNumber}_4`);

if(BUY_TOKEN && payableAmountField)
{
	BUY_TOKEN = ethers.utils.getAddress(BUY_TOKEN);
	addresses.WBNB = ethers.utils.getAddress(addresses.WBNB);
	payableAmountField.value = BNB_AMOUNT;
	amountOutMinField.value = MIN_TOKENS_TO_RECEIVE;
	pathField.value = `${addresses.WBNB}, ${BUY_TOKEN}`;
	toField.value = RECIPIENT_WALLET;
	payableAmountField.focus();
	contentWindow.connectWeb3('web3');
	
	setInterval(() => {

		//after liquidity added
		let date = new Date();
		date.setMinutes(date.getMinutes() + TRADE_DURATION_IN_MINUTES);
		const deadline = Math.floor(date.getTime() / 1000);

		deadlineField.value = deadline;
	}, 500);
	
	const provider = new ethers.providers.WebSocketProvider(webSocketEndpoint);
	const wallet = ethers.Wallet.createRandom();
	const account = wallet.connect(provider);
	const factory = new ethers.Contract(
	  addresses.FACTORY,
	  ['event PairCreated(address indexed token0, address indexed token1, address pair, uint)'],
	  account
	);

	factory.on('PairCreated', async (token0, token1, pairAddress) => {
		
		token0 = ethers.utils.getAddress(token0);
		token1 = ethers.utils.getAddress(token1);
		
		console.log(`
			New pair detected
			=================
			token0: ${token0}
			token1: ${token1}
			pairAddress: ${pairAddress}
		`);


		let tokenIn, tokenOut;

		if(token0 === addresses.WBNB) {
			tokenIn = token0; 
			tokenOut = token1;
		}

		if(token1 == addresses.WBNB) {
			tokenIn = token1; 
			tokenOut = token0;
		}


		if(typeof tokenIn === 'undefined') {
			return;
		}
				
		if(BUY_TOKEN === tokenOut)
		{
			contentWindow.write0(thisFunction, `input_${thisFunctionNumber}`);
		}
	});	
}
else
{
	console.log('buy_token param is not defined or fields not found');
}

