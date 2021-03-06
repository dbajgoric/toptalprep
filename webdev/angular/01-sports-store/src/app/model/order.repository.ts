/**
 * Repository for managing Order objects.
 */
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { Order } from './order.model';
// import { StaticDatasource } from './static.datasource';
import { RestDatasource } from './rest.datasource';

@Injectable()
export class OrderRepository {
  private orders: Order[] = [];
  private loaded = false;

  constructor(private dataSource: RestDatasource) {}

  // A method to load orders from the server. As order are accessible by
  // administrators only, they are not loaded upon repository creation.
  // They are instead loaded upon request
  private loadOrders(): void {
    this.dataSource.getOrders()
      .subscribe(orders => {
        this.orders = orders;
        this.loaded = true;
      });
  }

  getOrders(): Order[] {
    if (!this.loaded) {
      this.loadOrders();
    }

    return this.orders;
  }

  saveOrder(order: Order): Observable<Order> {
    return this.dataSource.saveOrder(order);
  }

  updateOrder(order: Order): void {
    // TODO: the splicing of the order into this.orders array should not
    //       be necessary if `order` points to one of the objects within
    //       the this.orders array
    this.dataSource.updateOrder(order)
      .subscribe(o1 => {
        this.orders.splice(this.orders.findIndex(o2 => o2.id === order.id),
          1, order);
      });
  }

  deleteOrder(order: Order): void {
    this.dataSource.deleteOrder(order)
      .subscribe(o1 => {
        // Delete the order from the list of orders
        this.orders.splice(this.orders.findIndex(p2 => p2.id === order.id), 1);
      });
  }
}
