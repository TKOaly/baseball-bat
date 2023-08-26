import { Service } from "typedi";

@Service()
export class AppBus {
  private closeHandlers: Set<() => void> = new Set();

  public onClose(handler: () => (void | Promise<void>)) {
    this.closeHandlers.add(handler);
  }

  public removeCloseHandler(handler: () => (void | Promise<void>)) {
    this.closeHandlers.delete(handler);
  }

  public async close() {
    for (const handler of this.closeHandlers) {
      await Promise.resolve(handler());
    }
  }
}
