import { useRef } from 'react';
import * as mediasoupClient from 'mediasoup-client';
import { logger } from '../utils/logger';

/**
 * Custom hook to manage mediasoup device and transport setup
 *
 * @param {Object} client - Webvox client instance
 * @param {string} roomId - Room ID to connect to
 * @returns {Object} - { device, sendTransport, recvTransport, setupMediasoup }
 */
export function useMediasoupSetup(client, roomId) {
  const deviceRef = useRef(null);
  const sendTransportRef = useRef(null);
  const recvTransportRef = useRef(null);

  const setupMediasoup = async () => {
    // Create mediasoup device
    const device = new mediasoupClient.Device();
    deviceRef.current = device;

    // Get router capabilities and load device
    const routerCaps = await client.sfu.getRouterCapabilities(roomId);
    await device.load({ routerRtpCapabilities: routerCaps.rtpCapabilities });

    // Set RTP capabilities
    await client.sfu.setRtpCapabilities(device.rtpCapabilities);

    // Create send transport
    const sendTransportData = await client.sfu.createTransport('send');
    const sendTransport = device.createSendTransport(sendTransportData);
    sendTransportRef.current = sendTransport;

    sendTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
      try {
        await client.sfu.connectTransport(sendTransportData.id, dtlsParameters);
        callback();
      } catch (err) {
        logger.error('Send transport connect failed:', err);
        errback(err);
      }
    });

    sendTransport.on('produce', async ({ kind, rtpParameters, appData }, callback, errback) => {
      try {
        const { producerId } = await client.sfu.createProducer(
          sendTransportData.id,
          kind,
          rtpParameters,
          appData
        );
        callback({ id: producerId });
      } catch (err) {
        logger.error(`Failed to produce ${kind}:`, err);
        errback(err);
      }
    });

    // Create receive transport
    const recvTransportData = await client.sfu.createTransport('recv');
    const recvTransport = device.createRecvTransport(recvTransportData);
    recvTransportRef.current = recvTransport;

    recvTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
      try {
        await client.sfu.connectTransport(recvTransportData.id, dtlsParameters);
        callback();
      } catch (err) {
        logger.error('Receive transport connect failed:', err);
        errback(err);
      }
    });
  };

  const cleanup = () => {
    // Close transports
    if (sendTransportRef.current) {
      sendTransportRef.current.close();
      sendTransportRef.current = null;
    }
    if (recvTransportRef.current) {
      recvTransportRef.current.close();
      recvTransportRef.current = null;
    }
    deviceRef.current = null;
  };

  return {
    device: deviceRef,
    sendTransport: sendTransportRef,
    recvTransport: recvTransportRef,
    setupMediasoup,
    cleanup,
  };
}
