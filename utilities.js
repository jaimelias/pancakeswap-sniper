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