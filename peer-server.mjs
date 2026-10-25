// Local signalling server for automated online tests (the real app uses the free PeerJS cloud server).
import { PeerServer } from 'peer';
PeerServer({ port: 9000, path: '/', host: '127.0.0.1' }, s => console.log('peer server on', s.address()));
