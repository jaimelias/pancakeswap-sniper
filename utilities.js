import fetch from 'node-fetch';
import open from 'open';

export const openPancakeSwap = async ({inputCurrency, outputCurrency, slippage, exactAmount}) => await open(`https://pancakeswap.finance/swap?inputCurrency=${inputCurrency}&outputCurrency=${outputCurrency}&slippage=${slippage}&exactAmount=${exactAmount}`);

export const openBscScan = async (hash) => await open(`https://bscscan.com/tx/${hash}`);

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

export const tradeHasFailed = ({tokenOut, TARGET_CONTRACTS, status}) => {
	return TARGET_CONTRACTS.map((o, i) => {
		if(o.address === tokenOut)
		{
			o.failedOnce = (status) ? true : false;
		}
		
		return o;
	});					
};