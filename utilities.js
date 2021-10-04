import fetch from 'node-fetch';
import open from 'open';
import * as fs from 'fs';
import { ethers } from 'ethers';

const {getAddress} = ethers.utils;

export const openDex = async ({DEX, inputCurrency, outputCurrency, slippage, exactAmount}) => await open(`${DEX}/swap?inputCurrency=${inputCurrency}&outputCurrency=${outputCurrency}&slippage=${slippage}&exactAmount=${exactAmount}`);

export const openExplorer = async ({hash, EXPLORER}) => await open(`${EXPLORER}/tx/${hash}`);

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

export const dummyAddress = '0x0000000000000000000000000000000000000000';

export const logNewPair = ({token0, token1, pairAddress}) => {
console.log(`

+++++++++++++++++++++++++++++++++++++++++++++++++++++
-- New Pair --
token0: ${token0}
token1: ${token1}
pairAddress: ${pairAddress}
+++++++++++++++++++++++++++++++++++++++++++++++++++++

	`);				
};

