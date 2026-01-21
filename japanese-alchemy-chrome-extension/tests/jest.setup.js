// Mock Chrome API for tests
global.chrome = {
  storage: {
    local: {
      get: jest.fn(),
      set: jest.fn()
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
