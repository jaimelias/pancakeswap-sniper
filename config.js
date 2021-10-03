import { ethers } from 'ethers';
const {getAddress, hexlify, parseUnits} = ethers.utils;

const PANCAKESWAP = {
    WBNB: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
    BUSD: '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56',
	USDT: '0x55d398326f99059ff775485246999027b3197955',
    ROUTER: '0x10ED43C718714eb63d5aA57B78B54704E256024E',
	FACTORY: '0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73',
	CONFIG: {
		WRAPPED: 'WBNB',
		STABLE: 'USDT',
		RPC_NETWORK: 'https://bsc-dataseed1.binance.org/',
		EXPLORER: 'https://bscscan.com',
		DEX: 'https://pancakeswap.finance',
		GAS: {
			APPROVE:{
				gasLimit: 100000, 
				gasPrice: 5e9
			},
			SWAP: { 
				gasLimit: hexlify(200000), 
				gasPrice: parseUnits('10', 'gwei') 
			}
		}
	}
}

const QUICKSWAP = {
    WMATIC: '0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270',
	USDT: '0xc2132d05d31c914a87c6611c10748aeb04b58e8f',
    ROUTER: '0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff',
	FACTORY: '0x5757371414417b8C6CAad45bAeF941aBc7d3Ab32',
	CONFIG: {
		WRAPPED: 'WMATIC',
		STABLE: 'USDT',
		RPC_NETWORK: 'https://rpc-mainnet.maticvigil.com',
		EXPLORER: 'https://polygonscan.com',
		DEX: 'https://quickswap.exchange/#',
		GAS: {
			APPROVE:{
				gasLimit: 100000, 
				gasPrice: 5e9
			},
			SWAP: { 
				gasLimit: hexlify(200000), 
				gasPrice: parseUnits('10', 'gwei') 
			}
		}
	}
}

const exchanges = {PANCAKESWAP, QUICKSWAP};

export const getExchange = name => {
	const obj = {};
	const exchange = exchanges[name];
	
	for(let k in exchange)
	{
		obj[k] = (k !== 'CONFIG') ? getAddress(exchange[k]) : exchange[k];
	}
	
	return obj;
};

