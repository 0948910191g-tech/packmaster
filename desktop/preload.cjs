'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const invoke = channel => payload => ipcRenderer.invoke(channel, payload);

contextBridge.exposeInMainWorld('packmasterDesktop', Object.freeze({
  getContext: invoke('packmaster:stores:context'),
  listStores: invoke('packmaster:stores:list'),
  createStore: invoke('packmaster:stores:create'),
  switchStore: invoke('packmaster:stores:switch'),
  recovery: Object.freeze({
    getPending: invoke('packmaster:recovery:get-pending'),
    prepare: invoke('packmaster:recovery:prepare'),
    complete: invoke('packmaster:recovery:complete'),
    discard: invoke('packmaster:recovery:discard')
  })
}));
