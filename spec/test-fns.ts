import { EntityManager, NamingConvention, MetadataStore } from 'breeze-client';
import { ModelLibraryBackingStoreAdapter } from 'breeze-client/adapter-model-library-backing-store';
import { UriBuilderJsonAdapter } from 'breeze-client/adapter-uri-builder-json';
import { AjaxFetchAdapter } from 'breeze-client/adapter-ajax-fetch';
import { DataServiceWebApiAdapter } from 'breeze-client/adapter-data-service-webapi';

export const testIf = (condition: boolean) => (condition ? test : test.skip);
export const skipTestIf = (condition: boolean) => (condition ? test.skip : test);
export const describeIf = (condition: boolean) => (condition ? describe : describe.skip);
export const skipDescribeIf = (condition: boolean) => (condition ? describe.skip : describe);
export const expectPass = () => expect(true).toBe(true);

export class TestFns {
  // Uncomment just one
  static defaultServerEnvName = "ASPCORE";
  // static currentServerEnvName = "SEQUELIZE";
  // static currentServerEnvName = "HIBERNATE";
  // static currentServerEnvName = "MONGO";

  static serverEnvName: string;
  static defaultServiceName: string;
  static defaultMetadataStore: MetadataStore;
  static metadataStoreIsBeingFetched: boolean;
  
  static isODataServer: boolean;
  static isMongoServer: boolean;
  static isSequelizeServer: boolean;
  static isAspCoreServer: boolean;
  static isHibernateServer: boolean;

  static wellKnownData = {
    nancyID: 1 as any,
    alfredsID: '785efa04-cbf2-4dd7-a7de-083ee17b6ad2' as any,
    dummyOrderID: 999 as any,
    dummyEmployeeID: 9999 as any,
    chaiProductID: 1 as any,
    alfredsOrderDetailKey: { OrderID: 10643, ProductID: 28 /*R?ssle Sauerkraut*/ }, 
    keyNames:  {
      order: "orderID",
      customer: "customerID",
      employee: "employeeID",
      product: "productID",
      user: "id",
      supplier: "supplierID",
      region: "regionID"
    }
  };

  static initEnv(serverEnvName?: string) {
    if (serverEnvName == null) {
      serverEnvName = TestFns.defaultServerEnvName;
    }
    TestFns.serverEnvName = serverEnvName.toLocaleUpperCase();

    TestFns.isODataServer = serverEnvName === 'ODATA';
    TestFns.isMongoServer = serverEnvName === 'MONGO';
    TestFns.isSequelizeServer = serverEnvName === 'SEQUELIZE';
    TestFns.isAspCoreServer = serverEnvName === 'ASPCORE';
    TestFns.isHibernateServer = serverEnvName === 'HIBERNATE';

    TestFns.initAdapters();
    TestFns.updateWellKnownDataIfMongo();

    if (TestFns.isAspCoreServer) {
      TestFns.defaultServiceName = 'http://localhost:61552/breeze/NorthwindIBModel';
    } else {

    }
  }


  private static initAdapters() {
    global['fetch'] = require('node-fetch');

    // ModelLibraryBackingStoreAdapter.register();
    // UriBuilderJsonAdapter.register();
    // AjaxFetchAdapter.register();
    // DataServiceWebApiAdapter.register();
    
    DataServiceWebApiAdapter.register();
    UriBuilderJsonAdapter.register();
    AjaxFetchAdapter.register();
    ModelLibraryBackingStoreAdapter.register();

    NamingConvention.camelCase.setAsDefault();
  }

  static async initDefaultMetadataStore() {
    if (TestFns.defaultMetadataStore == null) {
      const ms = new MetadataStore();
      const x = await ms.fetchMetadata(TestFns.defaultServiceName);
      TestFns.defaultMetadataStore = ms;  
    }
    return TestFns.defaultMetadataStore;
  }

  static newEntityManager(metadataStore?: MetadataStore) {
    let em: EntityManager;
    if (metadataStore) {
      em = new EntityManager({ serviceName: TestFns.defaultServiceName, metadataStore: metadataStore });
    } else if (TestFns.defaultMetadataStore) {
      em = new EntityManager({ serviceName: TestFns.defaultServiceName, metadataStore: TestFns.defaultMetadataStore });
    } else {
      em = new EntityManager({ serviceName: TestFns.defaultServiceName });
    }
    return em;
  }

  private static updateWellKnownDataIfMongo() {
    if (TestFns.serverEnvName !== 'MONGO') {
      return;
    }
    TestFns.wellKnownData = {
      nancyID: "51a6d50e1711572dcc8ce7d1",
      alfredsID: null,
      dummyOrderID: "50a6d50e1711572dcc8ce7d1",
      dummyEmployeeID: "50a6d50e1711572dcc8ce7d2",
      chaiProductID: 10001,
      alfredsOrderDetailKey: null,
      keyNames: {
        order: "_id",
        customer: "_id",
        employee: "_id",
        product: "_id",
        user: "_id",
        supplier: "_id",
        region: "_id"
      }
    };
    
  }

  static sizeOf = sizeOf;
  static sizeOfDif = sizeOfDif;
  
}

// Misc Fns.

function sizeOf(value: any, level?: number): any {
  if (level == undefined) level = 0;
  let bytes = 0, keyBytes = 0;
  let children = null;
  if (value == null) {
    bytes = 1; // not sure how much space a null or undefined take.
  } else if (typeof value === 'boolean') {
    bytes = 4;
  } else if (typeof value === 'string') {
    bytes = value.length * 2;
  } else if (typeof value === 'number') {
    bytes = 8;
  } else if (typeof value === 'object') {
    if (value['__visited__']) return null;
    value['__visited__'] = 1;
    children = [];
    for (const propName in value) {
      if (propName !== "__visited__") {
        let r = sizeOf(value[propName], 1);
        if (r != null && r.size !== 0) {
          bytes += r.size;
          r.name = propName;
          children.push(r);
        }
      }
    }
  }

  if (level === 0) {
    clearVisited(value);
  }
  if (children) {
    children.sort(function (a, b) {
      return b.size - a.size;
    });
    const alt = {};
    children.forEach(function (c) {
      alt[c.name] = c;
    });
    children = alt;
  }
  return {
    size: bytes,
    children: children
  };
}

function sizeOfDif(s1: any, s2: any): any {

  const dif = (s1.size || 0) - (s2.size || 0);
  let s1Val, s2Val, oDif;
  if (dif === 0) return { dif: 0, children: [] };
  let children = [] as any;
  const s1Children = s1.children || {};
  const s2Children = s2.children || {};
  for (const s1Key in s1Children) {
    s1Val = s1Children[s1Key];
    s2Val = s2Children[s1Key];
    if (s2Val) {
      s2Val.visited = true;
      oDif = sizeOfDif(s1Val, s2Val);
      if (oDif) {
        oDif.name = s1Key;
        children.push(oDif);
      }
    } else {
      oDif = { name: s1Key, dif: s1Val.size, s1Children: s1Val.children };
      children.push(oDif);
    }
  }
  for (const s2Key in s2Children) {
    s2Val = s2Children[s2Key];
    if (!s2Val.visited) {
      oDif = { name: "-" + s2Key, dif: -1 * s2Val.size, s2Children: s2Val.children };
      children.push(oDif);
    }
  }

  const alt = {};
  children.forEach( (c: any) => {
    alt[c.name] = c;
  });
  children = alt;

  return { dif: dif, children: children };
}

function clearVisited(value: any) {
  if (value == null) return;
  if (typeof value === 'object' && value["__visited__"]) {
    delete value['__visited__'];
    for (const i in value) {
      clearVisited(value[i]);
    }
  }
}
