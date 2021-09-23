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
const BNB_AMOUNT = 1; //AMOUNT------------
let BUY_TOKEN = ''; //TOKEN------------
const RECIPIENT_WALLET = '0xAb88E902Ae4a49Db58d9D953Fbe59efd00512DC5';
const MIN_TOKENS_TO_RECEIVE = 0;
const IS_INFLATORY = false;
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

let toField = iframeDocument.getElementById(`input_${thisFunctionNumber}_3`);
let deadlineField = iframeDocument.getElementById(`input_${thisFunctionNumber}_4`);



if(payableAmountField)
{
	
	const formContainer = iframeDocument.getElementById(`collapse${thisFunctionNumber}`);
	const submitButton = formContainer.getElementsByTagName('button')[0];	
	
	addresses.WBNB = ethers.utils.getAddress(addresses.WBNB);
	contentWindow.connectWeb3('web3');
	payableAmountField.value = BNB_AMOUNT;
	amountOutMinField.value = MIN_TOKENS_TO_RECEIVE;
	
	toField.value = RECIPIENT_WALLET;

	setInterval(() => {

		//after liquidity added
		let date = new Date();
		date.setMinutes(date.getMinutes() + TRADE_DURATION_IN_MINUTES);
		const deadline = Math.floor(date.getTime() / 1000);

		deadlineField.value = deadline;
	}, 500);
	
	
	const show_prompt = ({contentWindow, thisFunction, thisFunctionNumber, WBNB}) => {

		let address = prompt('Please enter the contract address','Poppy');
		
		if (address)
		{
			address = ethers.utils.getAddress(address);
			const iframeDocument = contentWindow.document;

			let pathField = iframeDocument.getElementById(`input_${thisFunctionNumber}_2`);
			let payableAmountField = iframeDocument.getElementById(`input_payable_${thisFunctionNumber}_${thisFunction}`);
			
			pathField.value = `${WBNB}, ${address}`;
			
			submitButton.click();
		}
	}	
	
	
	
	if(BUY_TOKEN)
	{
		submitButton.click();
	}
	else
	{
		show_prompt({contentWindow, thisFunction, thisFunctionNumber, WBNB: addresses.WBNB});
	}			

}
else
{
	console.log('contract fields not found yet');
	console.log(`input_payable_${thisFunctionNumber}_${thisFunction}`);
	console.log(payableAmountField);
}


