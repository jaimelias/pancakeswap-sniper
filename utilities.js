import fetch from 'node-fetch';
import open from 'open';
import * as fs from 'fs';
import { ethers } from 'ethers';

const {getAddress} = ethers.utils;

export const openDex = async ({DEX, inputCurrency, outputCurrency, slippage, exactAmount}) => await open(`${DEX}/swap?inputCurrency=${inputCurrency}&outputCurrency=${outputCurrency}&slippage=${slippage}&exactAmount=${exactAmount}`);

export const openExplorer = async ({hash, EXPLORER}) => await open(`${EXPLORER}/tx/${hash}`);

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

const openTargetContracts = async () => fs.readFileSync('targetContracts.json', 'utf8');

export const getTargetContracts = async () => {
	const json = await openTargetContracts();
	
	if(json)
	{
		const data = JSON.parse(json);
		
		return data.map(o => {
			o.address = getAddress(o.address);
			o.slippage = (o.slippage < 0.5) ? 0.5 : o.slippage
			return o;
		});
	}
	
	return [];
};

