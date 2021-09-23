//EDIT FROM HERE
const BNB_AMOUNT = 2;
const BUY_TOKEN = '0x01e0d17a533e5930a349c2bb71304f04f20ab12b';
const RECIPIENT_WALLET = '0xAb88E902Ae4a49Db58d9D953Fbe59efd00512DC5';
const MIN_TOKENS_TO_RECEIVE = 0;
const IS_INFLATORY = true;
const TRADE_DURATION_IN_MINUTES = 5;
//EDIT UNTIL HERE

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

if(payableAmountField)
{
	BUY_TOKEN = ethers.utils.getAddress(BUY_TOKEN);
	addresses.WBNB = ethers.utils.getAddress(addresses.WBNB);
	payableAmountField.focus();
	contentWindow.connectWeb3('web3');
	payableAmountField.value = BNB_AMOUNT;
	amountOutMinField.value = MIN_TOKENS_TO_RECEIVE;
	pathField.value = `${addresses.WBNB}, ${BUY_TOKEN}`;
	toField.value = RECIPIENT_WALLET;

	setInterval(() => {

		//after liquidity added
		let date = new Date();
		date.setMinutes(date.getMinutes() + TRADE_DURATION_IN_MINUTES);
		const deadline = Math.floor(date.getTime() / 1000);

		deadlineField.value = deadline;
	}, 500);		
}
else
{
	console.log('contract fields not found yet');
	console.log(`input_payable_${thisFunctionNumber}_${thisFunction}`);
	console.log(payableAmountField);
}
