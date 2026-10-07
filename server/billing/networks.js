import { BlockList, isIP } from 'node:net';

// Subnets YooKassa sends notifications from (yookassa.ru/developers/using-api/webhooks).
export const YOOKASSA_NETWORKS = ['185.71.76.0/27', '185.71.77.0/27', '77.75.153.0/25', '77.75.156.11/32',
  '77.75.156.35/32', '77.75.154.128/25', '2a02:5180::/32'];

export function createAllowList(networks) {
  const list = new BlockList();
  for (const network of networks) {
    const [address, prefix] = network.split('/');
    list.addSubnet(address, Number(prefix), isIP(address) === 6 ? 'ipv6' : 'ipv4');
  }
  return (ip) => {
    const plain = String(ip).replace(/^::ffff:/i, '');
    const family = isIP(plain);
    return family !== 0 && list.check(plain, family === 6 ? 'ipv6' : 'ipv4');
  };
}
