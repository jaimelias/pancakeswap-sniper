import fetch from 'node-fetch';

export const getWhiteList = async (tsvList) => {
	
	const response = await fetch(tsvList);
	
	if(response.ok)
	{
		const data = await response.text();
		
		if(data)
		{
			return data.split('\n')
			.filter((v, i) => i > 0)
			.map(v => v.split('\t')[2])
			.filter(v => v);
		}
	}

	return [];
};


export const listedText = `

888     8888888 .d8888b.8888888888888888888888888888b.  
888       888  d88P  Y88b   888    888       888  "Y88b 
888       888  Y88b.        888    888       888    888 
888       888   "Y888b.     888    8888888   888    888 
888       888      "Y88b.   888    888       888    888 
888       888        "888   888    888       888    888 
888       888  Y88b  d88P   888    888       888  .d88P 
888888888888888 "Y8888P"    888    88888888888888888P"

`

export const swapUrl = 'https://pancakeswap.finance/swap?outputCurrency=';

export const getConsoleLog = ({tokenIn, tokenOut, pairAddress}) => (`

=================

tokenIn: ${tokenIn}
tokenOut: ${tokenOut}
pairAddress: ${pairAddress}
url: ${swapUrl}${tokenOut}

=================

`);