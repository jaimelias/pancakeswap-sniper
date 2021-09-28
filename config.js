import { ethers } from 'ethers';
const {getAddress} = ethers.utils;

const addresses = {
    WBNB: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
    BUSD: '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56',
    ROUTER: '0x10ED43C718714eb63d5aA57B78B54704E256024E',
	FACTORY: '0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73'
};

export const getAddresses = () => {
	const obj = {};
	
	for(let k in addresses)
	{
		obj[k] = getAddress(addresses[k]);
	}
	
	return obj;
};

