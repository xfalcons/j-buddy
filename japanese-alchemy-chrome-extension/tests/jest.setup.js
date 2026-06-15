// Mock Chrome API for tests. chrome.storage.local.get returns a Promise of a
// record (the real contract); returning undefined crashes modules that
// destructure the awaited result (e.g. authService.loadUserFromStorage).
global.chrome = {
  storage: {
    local: {
      get: jest.fn(async () => ({})),
      set: jest.fn(async () => undefined)
    },
    onChanged: {
      addListener: jest.fn(),
      removeListener: jest.fn()
    }
  },
  runtime: {
    onMessage: {
      addListener: jest.fn(),
      removeListener: jest.fn()
    }
  }
};

// Mock document and window APIs for tests
global.document = {
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
  querySelector: jest.fn(),
  getElementById: jest.fn(),
  createElement: jest.fn(),
  documentElement: {
    setAttribute: jest.fn(),
    getAttribute: jest.fn()
  }
};

global.window = {
  showSaveFilePicker: jest.fn(),
  localStorage: {
    getItem: jest.fn(),
    setItem: jest.fn()
  }
};

global.localStorage = {
  getItem: jest.fn(),
  setItem: jest.fn()
};

// Mock JaAlchemyApiService
class JaAlchemyApiService {
  async generateResponse(text) {
    return 'Mock response';
  }
}

global.JaAlchemyApiService = JaAlchemyApiService;
