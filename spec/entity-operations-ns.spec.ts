import { EntityManager, EntityType, ComplexType, EntityState, EntityAction, EntityChangedEventArgs, breeze, MetadataStore, SaveOptions, QueryOptions, ValidationOptions, Entity, DataType, core, EntityKey, RelationArray, MergeStrategy, AnyAllPredicate, EntityQuery, QueryResult } from 'breeze-client';
import { ModelLibraryBackingStoreAdapter } from 'breeze-client/adapter-model-library-backing-store';
import { TestFns, JsonObj } from './test-fns';
import { ObservableArrayChangedArgs } from 'src/observable-array';
import { PropertyChangedEventArgs, EntityAspect } from 'src/entity-aspect';
import { stringify } from 'querystring';

ModelLibraryBackingStoreAdapter.register();

TestFns.initNonServerEnv();

describe("Entity operations - no server", () => {

  beforeEach(function () {
    TestFns.initSampleMetadataStore();
  });

  test("can add unmapped 'foo' property directly to EntityType", function () {
    expect(3);
    const store = MetadataStore.importMetadata(TestFns.sampleMetadata);
    assertFooPropertyDefined(store, false);

    const customerType = store.getEntityType('Customer');
    const fooProp = new breeze.DataProperty({
      name: 'foo',
      defaultValue: 42,
      isUnmapped: true  // !!!
    });
    customerType.addProperty(fooProp);

    assertFooPropertyDefined(store, true);

    const cust = store.getAsEntityType('Customer').createEntity();
    const custID = cust.getProperty("customerID");
    const fooValue = cust.getProperty('foo');
    expect(fooValue).toBe(42);
  });

  test("merge new into deleted entity", function () {
    const em = TestFns.newEntityManager();
    const custX = em.createEntity("Customer");
    custX.entityAspect.acceptChanges();
    const cust = em.createEntity("Customer");
    // id will be new autogenerated Guid
    const id = cust.getProperty("customerID");
    // make it unmodified so that later delete does NOT detach it.
    cust.entityAspect.acceptChanges();
    cust.entityAspect.setDeleted();
    const sameCust = em.createEntity("Customer", { customerID: id }, null, MergeStrategy.OverwriteChanges);
    expect(sameCust.entityAspect.entityState).toBe(EntityState.Added);
    expect(sameCust.getProperty("customerID")).toBe(id);

    expect(sameCust).toBe(cust);
    em.rejectChanges();
  });




  test("new instead of createEntity with entityAspect", function () {
    const em = TestFns.newEntityManager(MetadataStore.importMetadata(TestFns.sampleMetadata));
    em.metadataStore.registerEntityTypeCtor("Customer", Customer);
    const customerKeyName = TestFns.wellKnownData.keyNames.customer;

    const cust1 = new Customer() as any;
    cust1.city = "xxx";
    const ea = new EntityAspect(cust1);
    cust1.setProperty("city", "yyy");
    cust1.setProperty(customerKeyName, breeze.core.getUuid());

    const cust2 = em.metadataStore.getAsEntityType("Customer").createEntity();
    cust2.setProperty(customerKeyName, breeze.core.getUuid());

    em.attachEntity(cust1);
    em.attachEntity(cust2);
    expect(em.getEntities().length).toBe(2);
  });


  test("new instead of createEntity w/o entityAspect", function () {
    const em = TestFns.newEntityManager(MetadataStore.importMetadata(TestFns.sampleMetadata));
    em.metadataStore.registerEntityTypeCtor("Customer", Customer);
    const customerKeyName = TestFns.wellKnownData.keyNames.customer;

    const cust0 = new Customer() as any;
    cust0.setProperty("city", "zzz");
    cust0.setProperty(customerKeyName, breeze.core.getUuid());
    em.attachEntity(cust0);
    expect(cust0.getProperty("city")).toBe("zzz");

    const cust1 = new Customer() as any;
    cust1.city = "zzz";
    const city = cust1.city;
    expect(city).toBe("zzz");
    cust1[customerKeyName] = breeze.core.getUuid();
    em.attachEntity(cust1);
    expect(cust1.getProperty("city")).toBe("zzz");
  });


  test("attaching entities in ctor makes fk values update", function () {
    const em = TestFns.newEntityManager(MetadataStore.importMetadata(TestFns.sampleMetadata));
    const initializer = function (sup: any) {
      const prod1 = em.createEntity("Product");
      sup.products.push(prod1);

      const prod2 = em.createEntity("Product");
      sup.products.push(prod2);
      // problem occurs because em._unattachedChildrenMap gets entries for old SupplierID:#Foo-0 and new SupplierID:#Foo--3
    };

    em.metadataStore.registerEntityTypeCtor("Supplier", null, initializer);

    const sup = em.createEntity("Supplier");

    expect(sup.getProperty("supplierID") < 0).toBe(true);
    const prods = sup.getProperty("products");
    expect(prods[0].getProperty("productID") < 0).toBe(true);
    expect(prods[0].getProperty("supplierID") < 0).toBe(true);
    expect(prods[1].getProperty("productID") < 0).toBe(true);
    expect(prods[1].getProperty("supplierID") < 0).toBe(true);
  });


  test("event token is the same for different entities", function () {
    const em = TestFns.newEntityManager();

    const emp1 = em.createEntity("Employee", { firstName: "Joe1", lastName: "Smith1", birthDate: new Date(2000, 1, 1) });
    const emp2 = em.createEntity("Employee", { firstName: "Joe2", lastName: "Smith2", birthDate: new Date(2000, 1, 1) });

    const token1 = emp1.entityAspect.propertyChanged.subscribe(function (changeArgs) {
      const a = changeArgs;
    });
    const token2 = emp2.entityAspect.propertyChanged.subscribe(function (changeArgs) {
      const a = changeArgs;
    });

    expect(token1).not.toBe(token2);
  });

  test("set nullable props with an empty string", function () {
    const em = TestFns.newEntityManager();

    const emp = em.createEntity("Employee", { firstName: "Joe", lastName: "Smith", birthDate: new Date(2000, 1, 1) });
    const bd = emp.getProperty("birthDate");
    expect(bd != null);
    emp.setProperty("birthDate", "");
    const b2 = emp.getProperty("birthDate");
    expect(b2).toBeNull;
  });


  test("create and init relations", function () {
    const em = TestFns.newEntityManager();
    const orderKeyName = TestFns.wellKnownData.keyNames.order;
    const productKeyName = TestFns.wellKnownData.keyNames.product;
    let newDetail = null;
    // pretend parent entities were queried
    let cfg = {};
    cfg[orderKeyName] = 1;
    const parentOrder = em.createEntity("Order", cfg, breeze.EntityState.Unchanged);
    cfg = {};
    cfg[productKeyName] = 1;
    const parentProduct = em.createEntity("Product", cfg, breeze.EntityState.Unchanged);
    newDetail = em.createEntity("OrderDetail", { order: parentOrder, product: parentProduct });

    expect(newDetail && newDetail.entityAspect.entityState.isAdded()).toBe(true);
    expect(parentOrder.entityAspect.entityState.isUnchanged()).toBe(true);
    expect(parentProduct.entityAspect.entityState.isUnchanged()).toBe(true);
  });


  test("create and init relations - detached entities", function () {
    const em = TestFns.newEntityManager();
    const orderKeyName = TestFns.wellKnownData.keyNames.order;
    const productKeyName = TestFns.wellKnownData.keyNames.product;

    let newDetail = null;
    // pretend parent entities were queried
    let cfg = {};
    cfg[orderKeyName] = 1;
    const parentOrder = em.createEntity("Order", cfg, breeze.EntityState.Detached);
    cfg = {};
    cfg[productKeyName] = 1;
    const parentProduct = em.createEntity("Product", cfg, breeze.EntityState.Detached);
    newDetail = em.createEntity("OrderDetail", { order: parentOrder, product: parentProduct });

    expect(newDetail && newDetail.entityAspect.entityState.isAdded()).toBe(true);
    expect(parentOrder.entityAspect.entityState.isAdded()).toBe(true);
    expect(parentProduct.entityAspect.entityState.isAdded()).toBe(true);
  });




  test("set foreign key property to null", async function () {
    expect.hasAssertions();
    const productQuery = new EntityQuery("Products").where("supplierID", "ne", null).take(1);

    const em = TestFns.newEntityManager();
    const qr = await em.executeQuery(productQuery);
    await qr.results[0].entityAspect.loadNavigationProperty("supplier");
    const products = qr.results;
    const firstProduct = products[0];
    const supplierKeyName = TestFns.wellKnownData.keyNames.supplier;
    expect(firstProduct.getProperty(supplierKeyName)).toBeTruthy();
    firstProduct.setProperty(supplierKeyName, null);
    expect(firstProduct.getProperty(supplierKeyName)).toBeNull();
  });


  test("null foriegn key", async function () {
    expect.hasAssertions();
    const em = TestFns.newEntityManager();
    const productType = em.metadataStore.getAsEntityType("Product");
    let product = productType.createEntity();
    em.attachEntity(product);
    product.setProperty("productName", "foo");
    product.setProperty('supplierID', null);
    let errs = product.entityAspect.getValidationErrors();
    expect(errs.length).toBe(0);
    const q = EntityQuery.from("Products").take(1);

    const qr1 = await em.executeQuery(q);
    const products = qr1.results;
    product = products[0];
    product.setProperty('supplierID', null);
    errs = product.entityAspect.getValidationErrors();
    expect(errs.length).toBe(0);
  });


  test("create entity with non-null dates", function () {
    const em = TestFns.newEntityManager(); // new empty EntityManager
    const userType = em.metadataStore.getAsEntityType("User");
    const userKeyName = TestFns.wellKnownData.keyNames.user;
    const user = userType.createEntity();

    const crtnDate = user.getProperty("createdDate");
    const modDate = user.getProperty("modifiedDate");
    expect(core.isDate(crtnDate)).toBe(true);
    expect(core.isDate(modDate)).toBe(true);
    em.addEntity(user);
    // need to do this after the addEntity call
    const id = user.getProperty(userKeyName);
    const exported = em.exportEntities(null, { includeMetadata: false });
    const em2 = TestFns.newEntityManager();
    em2.importEntities(exported);
    const user2 = em2.getEntityByKey("User", id);
    const crtnDate2 = user2.getProperty("createdDate");
    const modDate2 = user2.getProperty("modifiedDate");
    expect(core.isDate(crtnDate2)).toBe(true);
    expect(core.isDate(modDate2)).toBe(true);
    expect(crtnDate2.getTime()).toBe(crtnDate.getTime());
    expect(modDate2.getTime()).toBe(modDate.getTime());
  });


  test("create entity with initial properties", function () {
    const em = TestFns.newEntityManager(); // new empty EntityManager
    const empType = em.metadataStore.getAsEntityType("Employee");
    const employeeKeyName = TestFns.wellKnownData.keyNames.employee;
    let cfg: JsonObj = {
      firstName: "John",
      lastName: "Smith"
    };

    const testVal = 42;

    cfg[employeeKeyName] = TestFns.wellKnownData.dummyEmployeeID;
    const employee = empType.createEntity(cfg);
    expect(employee.getProperty("firstName")).toBe("John");
    expect(employee.getProperty(employeeKeyName)).toBe(TestFns.wellKnownData.dummyEmployeeID);

    cfg = {
      firstxame: "John",
      lastName: "Smith"
    };
    cfg[employeeKeyName] = TestFns.wellKnownData.dummyEmployeeID;
    const partialEmp = empType.createEntity(cfg);
    expect(employee.getProperty("lastName")).toBe("Smith");
  });


  

  test("entityType.getProperty nested", function () {
    const odType = TestFns.sampleMetadataStore.getEntityType("OrderDetail");
    const orderType = TestFns.sampleMetadataStore.getEntityType("Order");

    const customerProp = odType.getProperty("order.customer");
    const customerProp2 = orderType.getProperty("customer");
    expect(customerProp).toBeTruthy();
    expect(customerProp).toBe(customerProp2);
    const prop1 = odType.getProperty("order.customer.companyName");
    const prop2 = orderType.getProperty("customer.companyName");
    expect(prop1).toBeTruthy();
    expect(prop1).toBe(prop2);
  });

  

  test("unmapped import export", function () {
    // use a different metadata store for this em - so we don't polute other tests

    const em1 = TestFns.newEntityManager(MetadataStore.importMetadata(testFns.metadataStore.exportMetadata()));
    const Customer = testFns.makeEntityCtor(function () {
      this.miscData = "asdf";
    });
    em1.metadataStore.registerEntityTypeCtor("Customer", Customer);

    const custType = em1.metadataStore.getEntityType("Customer");
    const cust = custType.createEntity();
    em1.addEntity(cust);
    cust.setProperty("companyName", "foo2");
    cust.setProperty("miscData", "zzz");
    const bundle = em1.exportEntities();
    const em2 = new EntityManager({ serviceName: testFns.serviceName, metadataStore: em1.metadataStore });
    em2.importEntities(bundle);
    const entities = em2.getEntities();
    expect(entities.length).toBe(1);
    const sameCust = entities[0];
    const cname = sameCust.getProperty("companyName");
    expect(cname).toBe("foo2", "companyName should === 'foo2'");
    const miscData = sameCust.getProperty("miscData");
    expect(miscData).toBe("zzz", "miscData should === 'zzz'");


  });

  test("unmapped import export unmapped suppressed", function () {
    // use a different metadata store for this em - so we don't polute other tests
    const em1 = TestFns.newEntityManager(MetadataStore.importMetadata(testFns.metadataStore.exportMetadata()));
    const Customer = testFns.makeEntityCtor(function () {
      this.miscData = "asdf";
    });
    em1.metadataStore.registerEntityTypeCtor("Customer", Customer);

    const custType = em1.metadataStore.getEntityType("Customer");
    const cust = custType.createEntity();
    em1.addEntity(cust);
    cust.setProperty("companyName", "foo2");
    cust.setProperty("miscData", "zzz");
    em1.metadataStore.setProperties({
      serializerFn: function (dp, value) {
        return dp.isUnmapped ? undefined : value;
      }
    });
    const bundle = em1.exportEntities(null, { includeMetadata: false });

    const em2 = new EntityManager({ serviceName: testFns.serviceName, metadataStore: em1.metadataStore });
    em2.importEntities(bundle);

    const entities = em2.getEntities();
    expect(entities.length).toBe(1);
    const sameCust = entities[0];
    const cname = sameCust.getProperty("companyName");
    expect(cname).toBe("foo2", "companyName should === 'foo2'");
    const miscData = sameCust.getProperty("miscData");
    expect(miscData == null, "miscData should not have been serialized");

  });

  test("unmapped import export version mismatch", function () {

    // use a different metadata store for this em - so we don't polute other tests
    const em1 = TestFns.newEntityManager(MetadataStore.importMetadata(testFns.metadataStore.exportMetadata()));
    const Customer = testFns.makeEntityCtor(function () {
      this.miscData = "asdf";
    });
    em1.metadataStore.registerEntityTypeCtor("Customer", Customer);

    const custType = em1.metadataStore.getEntityType("Customer");
    const cust = custType.createEntity();
    em1.addEntity(cust);
    cust.setProperty("companyName", "foo2");
    cust.setProperty("miscData", "zzz");
    em1.metadataStore.setProperties({
      name: "version 1.1"
    });
    const bundle = em1.exportEntities(null, { includeMetadata: false });
    const em2 = new EntityManager({ serviceName: testFns.serviceName, metadataStore: em1.metadataStore });
    try {
      em2.importEntities(bundle, {
        metadataVersionFn: function (cfg) {
          if (em2.metadataStore.name != cfg.metadataStoreName) {
            throw new Error("bad version")
          }
        }
      });

      em1.metadataStore.setProperties({
        name: "version 1.2"
      });

      em2.importEntities(bundle, {
        metadataVersionFn: function (cfg) {
          if (em2.metadataStore.name != cfg.metadataStoreName) {
            throw new Error("bad version 2")
          }
        }
      });
      expect(false, "should not get here");
    } catch (e) {
      expect(e.message == "bad version 2", "should be a bad version error")
    }

  });

  test("unmapped import export with ES5 props", function () {

    // use a different metadata store for this em - so we don't polute other tests

    const em1 = TestFns.newEntityManager(MetadataStore.importMetadata(testFns.metadataStore.exportMetadata()));
    const Customer = testFns.models.CustomerWithES5Props();
    em1.metadataStore.registerEntityTypeCtor("Customer", Customer);

    const custType = em1.metadataStore.getEntityType("Customer");
    const cust = custType.createEntity();
    em1.addEntity(cust);
    cust.setProperty("companyName", "foo2");
    const cname = cust.getProperty("companyName");
    expect(cname).toBe("FOO2", "companyName should).toBe('FOO2'");
    cust.setProperty("miscData", "zzz");
    const bundle = em1.exportEntities();
    const em2 = new EntityManager({ serviceName: testFns.serviceName, metadataStore: em1.metadataStore });
    em2.importEntities(bundle);
    const entities = em2.getEntities();
    expect(entities.length).toBe(1);
    const sameCust = entities[0];
    const cname2 = sameCust.getProperty("companyName");
    expect(cname2).toBe("FOO2", "companyName should).toBe('FOO2'");
    const miscData = sameCust.getProperty("miscData");
    expect(miscData).toBe("zzz", "miscData should).toBe('zzz'");

  });

  test("generate ids", function () {
    const orderType = testFns.metadataStore.getEntityType("Order");
    const em = TestFns.newEntityManager();
    const count = 10;
    for (const i = 0; i < count; i++) {
      const ent = orderType.createEntity();
      em.addEntity(ent);
    }
    const tempKeys = em.keyGenerator.getTempKeys();
    expect(tempKeys.length == count);
    tempKeys.forEach(function (k) {
      expect(em.keyGenerator.isTempKey(k), "This should be a temp key: " + k.toString());
    });
  });

  test("createEntity and check default values", function () {
    const et = testFns.metadataStore.getEntityType("Customer");
    checkDefaultValues(et);
    const entityTypes = testFns.metadataStore.getEntityTypes();
    entityTypes.forEach(function (et) {
      checkDefaultValues(et);
    });
  });

  // removed this test until we can find a better way to handle skipping
  //testFns.skipIf("aspcore-efcore,mongo,efcodefirst,nhibernate,hibernate,odata", "does not support 'defaultValues'").
  //test("category default rowversion value", function () {

  //  const em = TestFns.newEntityManager();
  //  const catType = em.metadataStore.getEntityType("Category");
  //  const cat = em.createEntity("Category");
  //  expect(cat.getProperty("rowVersion")).toBe(2, "Expected failure (with CodeFirst) - This test is expected to fail with a CodeFirst model but succeed with DatabaseFirst model");
  //});



  test("propertyChanged", function () {

    const em = TestFns.newEntityManager();
    const orderType = em.metadataStore.getEntityType("Order");
    expect(orderType);
    const orderDetailType = em.metadataStore.getEntityType("OrderDetail");
    expect(orderDetailType);
    const order = orderType.createEntity();
    const lastProperty, lastOldValue, lastNewValue;
    order.entityAspect.propertyChanged.subscribe(function (args) {
      expect(args.entity).toBe(order, "args.entity).toBe(order");
      lastProperty = args.propertyName;
      lastOldValue = args.oldValue;
      lastNewValue = args.newValue;
    });
    const order2 = orderType.createEntity();

    order.setProperty("employeeID", 1);
    order2.setProperty("employeeID", 999); // should not raise event
    expect(lastProperty).toBe("employeeID");
    expect(lastNewValue).toBe(1);
    order.setProperty("freight", 123.34);
    expect(lastProperty).toBe("freight");
    expect(lastNewValue).toBe(123.34);
    order.setProperty("shippedDate", new Date(2000, 1, 1));
    expect(lastProperty).toBe("shippedDate");
    expect(lastNewValue.toDateString() == new Date(2000, 1, 1).toDateString());

    order.setProperty("employeeID", 2);
    expect(lastProperty).toBe("employeeID");
    expect(lastNewValue).toBe(2);
    expect(lastOldValue).toBe(1);
  });

  test("propertyChanged unsubscribe", function () {
    const em = TestFns.newEntityManager();
    const orderType = em.metadataStore.getEntityType("Order");
    expect(orderType);
    const order = orderType.createEntity();
    const lastProperty, lastOldValue, lastNewValue;
    const key = order.entityAspect.propertyChanged.subscribe(function (args) {
      lastProperty = args.propertyName;
      lastOldValue = args.oldValue;
      lastNewValue = args.newValue;
    });
    order.setProperty(testFns.orderKeyName, wellKnownData.dummyOrderID);
    expect(lastProperty).toBe(testFns.orderKeyName);
    expect(lastNewValue).toBe(wellKnownData.dummyOrderID);
    order.entityAspect.propertyChanged.unsubscribe(key);
    order.setProperty("employeeID", wellKnownData.dummyEmployeeID);
    expect(lastProperty).toBe(testFns.orderKeyName);
    expect(lastNewValue).toBe(wellKnownData.dummyOrderID);
  });

  test("propertyChanged on query", function () {
    expect.hasAssertions();
    const em = TestFns.newEntityManager();
    const empType = em.metadataStore.getEntityType("Employee");
    expect(empType);
    const emp = empType.createEntity();
    emp.setProperty(testFns.employeeKeyName, wellKnownData.nancyID);
    const changes = [];
    emp.entityAspect.propertyChanged.subscribe(function (args) {
      changes.push(args);
    });
    em.attachEntity(emp);
    // now fetch
    const q = EntityQuery.fromEntities(emp);
    const uri = q._toUri(em);

    return em.executeQuery(q, function (data) {
      expect(changes.length).toBe(1, "query merges should only fire a single property change");
      expect(changes[0].propertyName).toBe(null, "propertyName should be null on a query merge");
    });
  });

  test("propertyChanged suppressed on query", function () {
    expect.hasAssertions();
    const em = TestFns.newEntityManager();
    const empType = em.metadataStore.getEntityType("Employee");
    expect(empType);
    const emp = empType.createEntity();
    emp.setProperty(testFns.employeeKeyName, wellKnownData.nancyID);
    const changes = [];
    emp.entityAspect.propertyChanged.subscribe(function (args) {
      changes.push(args);
    });
    Event.enable("propertyChanged", em, false);
    em.attachEntity(emp);
    // now fetch
    const q = EntityQuery.fromEntities(emp);

    return em.executeQuery(q, function (data) {
      expect(changes.length).toBe(0, "query merges should not fire");
    });
  });

  test("delete entity - check children", function () {

    const em = TestFns.newEntityManager();
    const order = createOrderAndDetails(em);
    const orderId = order.getProperty("orderID");
    const details = order.getProperty("orderDetails");
    const copyDetails = details.slice(0);
    expect(details.length > 0, "order should have details");
    order.entityAspect.setDeleted();
    expect(order.entityAspect.entityState.isDeleted(), "order should be deleted");

    expect(details.length).toBe(0, "order should now have no details");

    copyDetails.forEach(function (od) {
      expect(od.getProperty("order")).toBe(null, "orderDetail.order should not be set");
      expect(od.getProperty("orderID")).toBe(orderId, "orderDetail.orderId should still be set to orig orderID because it is part of the key");
      expect(od.entityAspect.entityState.isModified(), "orderDetail should be 'modified");
    });
  });


  test("delete entity children then parent - check children", function () {

    const em = TestFns.newEntityManager();
    const order = createOrderAndDetails(em);
    const orderID = order.getProperty("orderID");
    const details = order.getProperty("orderDetails");
    const copyDetails = details.slice(0);
    expect(details.length > 0, "order should have details");
    copyDetails.forEach(function (od) {
      od.entityAspect.setDeleted();
    });
    order.entityAspect.setDeleted();
    expect(order.entityAspect.entityState.isDeleted(), "order should be deleted");

    expect(details.length).toBe(0, "order should now have no details");

    copyDetails.forEach(function (od) {
      expect(od.getProperty("order")).toBe(null, "orderDetail.order should not be set");
      const defaultOrderId = od.entityType.getProperty("orderID").defaultValue;
      expect(od.getProperty("orderID")).toBe(orderID, "orderDetail.orderID should still be set to orig orderID");
      expect(od.entityAspect.entityState.isDeleted(), "orderDetail should be 'deleted'");
    });
  });


  test("delete entity children then parent - check children (guid ids)", function () {

    const em = TestFns.newEntityManager();
    const customer = createCustomerAndOrders(em);
    const custID = customer.getProperty("customerID");
    const orders = customer.getProperty("orders");
    const copyOrders = orders.slice(0);
    expect(copyOrders.length > 0, "order should have details");
    copyOrders.forEach(function (order) {
      order.entityAspect.setDeleted();
    });
    customer.entityAspect.setDeleted();
    expect(customer.entityAspect.entityState.isDeleted(), "order should be deleted");

    expect(orders.length).toBe(0, "order should now have no details");

    copyOrders.forEach(function (order) {
      expect(order.getProperty("customer")).toBe(null, "order.customer should not be set");
      expect(order.getProperty("customerID")).toBe(custID, "order.customerID should still be set to orig cust");
      expect(order.entityAspect.entityState.isDeleted(), "order should be 'deleted'");
    });
  });

  testFns.skipIf("mongo", "does not have an OrderDetail table").
    test("delete entity - check parent", function () {

      const em = TestFns.newEntityManager();
      const order = createOrderAndDetails(em);
      const details = order.getProperty("orderDetails");
      const od = details[0];
      expect(details.indexOf(od) !== -1);
      const copyDetails = details.slice(0);
      expect(details.length > 0, "order should have details");
      od.entityAspect.setDeleted();
      expect(od.entityAspect.entityState.isDeleted(), "orderDetail should be deleted");

      expect(details.length).toBe(copyDetails.length - 1, "order should now have 1 less detail");
      expect(details.indexOf(od)).toBe(-1);

      expect(od.getProperty("order")).toBe(null, "orderDetail.order should not be set");
      const defaultOrderId = od.entityType.getProperty("orderID").defaultValue;
      // we deliberately leave the orderID alone after a delete - we are deleting the entity and do not want a 'mod' to cloud the issue
      // ( but we do 'detach' the Order itself.)
      expect(od.getProperty("orderID")).toBe(order.getProperty("orderID"), "orderDetail.orderId should not change as a result of being deleted");
    });

  testFns.skipIf("mongo", "does not have an OrderDetail table").
    test("detach entity - check children", function () {

      const em = TestFns.newEntityManager();
      const order = createOrderAndDetails(em);
      const orderId = order.getProperty(testFns.orderKeyName);
      const details = order.getProperty("orderDetails");
      const copyDetails = details.slice(0);
      expect(details.length > 0, "order should have details");
      em.detachEntity(order);
      expect(order.entityAspect.entityState.isDetached(), "order should be detached");

      expect(details.length).toBe(0, "order should now have no details");

      copyDetails.forEach(function (od) {
        expect(od.getProperty("order")).toBe(null, "orderDetail.order should not be set");
        expect(od.getProperty(testFns.orderKeyName)).toBe(orderId, "orderDetail.orderId should not have changed");
        expect(od.entityAspect.entityState.isUnchanged(), "orderDetail should be 'modified");
      });
    });

  testFns.skipIf("mongo", "does not have an OrderDetail table").
    test("hasChanges", function () {

      const em = TestFns.newEntityManager();

      const orderType = em.metadataStore.getEntityType("Order");
      const orderDetailType = em.metadataStore.getEntityType("OrderDetail");
      const order1 = createOrderAndDetails(em, false);
      const order2 = createOrderAndDetails(em, false);

      const valid = em.hasChanges();
      expect(valid, "should have some changes");
      try {
        const x = em.hasChanges("order");
        expect(false, "should have failed");
      } catch (e) {
        expect(e.message.indexOf("order") != -1, " should have an error message about 'order'");
      }
      valid = em.hasChanges("Order");
      expect(valid, "should have changes for Orders");
      try {
        const y = em.hasChanges(["Order", "OrderDetXXX"]);
        expect(false, "should have failed");
      } catch (e) {
        expect(e.message.indexOf("OrderDetXXX") != -1, " should have an error message about 'order'");
      }
      valid = em.hasChanges([orderType, orderDetailType]);
      expect(valid, "should have changes for Orders or OrderDetails");
      em.getChanges(orderType).forEach(function (e) {
        e.entityAspect.acceptChanges();
      });
      valid = !em.hasChanges(orderType);
      expect(valid, "should not have changes for Orders");
      valid = em.hasChanges("OrderDetail");
      expect(valid, "should still have changes for OrderDetails");
      em.getChanges(orderDetailType).forEach(function (e) {
        e.entityAspect.acceptChanges();
      });

      valid = !em.hasChanges(["Order", "OrderDetail"]);
      expect(valid, "should no longer have changes for Orders or OrderDetails");
      valid = !em.hasChanges();
      expect(valid, "should no longer have any changes");
    });

  testFns.skipIf("mongo", "does not have an OrderDetail table").
    test("rejectChanges", function () {

      const em = TestFns.newEntityManager();
      const orderType = em.metadataStore.getEntityType("Order");
      const orderDetailType = em.metadataStore.getEntityType("OrderDetail");
      const order1 = createOrderAndDetails(em, false);
      const order2 = createOrderAndDetails(em, false);

      const valid = em.hasChanges();
      expect(valid, "should have some changes");
      valid = em.hasChanges(orderType);
      expect(valid, "should have changes for Orders");
      valid = em.hasChanges([orderType, orderDetailType]);
      expect(valid, "should have changes for Orders or OrderDetails");
      em.getChanges(orderType).forEach(function (e) {
        e.entityAspect.acceptChanges();
        e.setProperty("freight", 100);
        expect(e.entityAspect.entityState.isModified(), "should be modified");
      });
      const rejects = em.rejectChanges();
      expect(rejects.length > 0, "should have rejected some");
      const hasChanges = em.hasChanges(orderType);
      expect(!hasChanges, "should not have changes for Orders");
      hasChanges = em.hasChanges(orderDetailType);
      expect(!hasChanges, "should not have changes for OrderDetails");

      valid = !em.hasChanges();
      expect(valid, "should no longer have any changes");
    });

  // const Customer = function () {
  //   this.miscData = "asdf";
  //   this.getNameLength = function () {
  //     return (this.getProperty("companyName") || "").length;
  //   };
  // };

  class Customer {
    miscData: string;
    constructor() {
      this.miscData = "asdf";
    }

    getNameLength() {
      return ((this as any).getProperty("companyName") || "").length;
    }
  }


  function assertFooPropertyDefined(metadataStore, shouldBe) {
    const custType = metadataStore.getEntityType("Customer");
    const fooProp = custType.getDataProperty('foo');
    if (shouldBe) {
      expect(fooProp && fooProp.isUnmapped,
        "'foo' property should be defined as unmapped property after registration.");
    } else {
      expect(!fooProp, "'foo' property should NOT be defined before registration.");
    }
    return fooProp;
  }

  function createOrderAndDetails(em, shouldAttachUnchanged) {
    if (shouldAttachUnchanged === undefined) shouldAttachUnchanged = true;
    const metadataStore = em.metadataStore;
    const orderType = em.metadataStore.getEntityType("Order");
    const orderDetailType = em.metadataStore.getEntityType("OrderDetail");
    const order = em.createEntity(orderType);

    expect(order.entityAspect.entityState.isAdded(), "order should be 'detached");
    for (const i = 0; i < 3; i++) {
      const od = orderDetailType.createEntity();
      od.setProperty("productID", i + 1); // part of pk
      order.getProperty("orderDetails").push(od);
      expect(od.entityAspect.entityState.isAdded(), "orderDetail should be 'detached");
    }
    const orderId = order.getProperty("orderID");
    expect(orderId != 0, "orderID should not be 0");
    if (shouldAttachUnchanged) {
      order.entityAspect.acceptChanges();
      order.getProperty("orderDetails").forEach(function (od) {
        od.entityAspect.acceptChanges();
        expect(od.getProperty("order")).toBe(order, "orderDetail.order not set");
        expect(od.getProperty("orderID")).toBe(orderId, "orderDetail.orderId not set");
        expect(od.entityAspect.entityState.isUnchanged(), "orderDetail should be 'unchanged");
      });
    } else {
      order.getProperty("orderDetails").forEach(function (od) {
        expect(od.getProperty("order")).toBe(order, "orderDetail.order not set");
        expect(od.getProperty("orderID")).toBe(orderId, "orderDetail.orderId not set");
        expect(od.entityAspect.entityState.isAdded(), "orderDetail should be 'added");
      });
    }
    return order;
  }

  function createCustomerAndOrders(em: EntityManager, shouldAttachUnchanged: boolean, orderCount: number) {
    if (!orderCount) orderCount = 3;
    if (shouldAttachUnchanged).toBe(undefined) shouldAttachUnchanged = true;
    const metadataStore = em.metadataStore;
    const customerType = em.metadataStore.getAsEntityType("Customer");
    const orderType = em.metadataStore.getAsEntityType("Order");

    const customer = em.createEntity(customerType);
    expect(customer.entityAspect.entityState.isAdded()).toBe(true);
    for (let i = 0; i < orderCount; i++) {
      const order = em.createEntity(orderType);
      customer.getProperty("orders").push(order);
      expect(order.entityAspect.entityState.isAdded()).toBe(true);
    }

    if (shouldAttachUnchanged) {
      customer.entityAspect.acceptChanges();
      const custId = customer.getProperty("customerID");
      customer.getProperty("orders").forEach((order: Entity) => {
        order.entityAspect.acceptChanges();
        expect(order.getProperty("customer")).toBe(customer);
        expect(order.getProperty("customerID")).toBe(custId);
        expect(order.entityAspect.entityState.isUnchanged()).toBe(true);
      });
    } else {
      const custId = customer.getProperty("customerID");
      customer.getProperty("orders").forEach((order: Entity) => {
        expect(order.getProperty("customer")).toBe(customer);
        expect(order.getProperty("customerID")).toBe(custId);
        expect(order.entityAspect.entityState.isAdded()).toBe(true);
      });
    }
    return customer;
  }


  

  function checkDefaultValues(structType) {
    const props = structType.getProperties();
    expect(props.length, "No data properties for structType: " + structType.name);
    const fn = structType.createEntity || structType.createInstance;
    const entity = fn.apply(structType);
    props.forEach(function (p) {
      const v = entity.getProperty(p.name);
      if (p.isUnmapped) {
        // do nothing
      } else if (p.isDataProperty) {
        if (p.isScalar) {
          if (p.isComplexProperty) {
            expect(v !== null, core.formatString("'%1': prop: '%2' - was null",
              structType.name, p.name));
          } else if (p.defaultValue != null) {
            expect(v).toBe(p.defaultValue, core.formatString("'%1': prop: '%2' - was: '%3' - should be defaultValue: '%4'",
              structType.name, p.name, v, p.defaultValue));
          } else if (p.isNullable) {
            expect(v).toBe(null, core.formatString("'%1': prop: '%2' - was: '%3' - should be null",
              structType.name, p.name, v));
          }
        } else {
          expect(v.arrayChanged, "value should be a complex array or primitive array");
        }
      } else {
        if (p.isScalar) {
          expect(v).toBe(null, core.formatString("'%1': prop: '%2' - was: '%3' - should be null",
            structType.name, p.name, v));
        } else {
          expect(v.arrayChanged, "value should be a relation array");
        }
      }
    });
  }

});