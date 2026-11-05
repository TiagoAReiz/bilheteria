import { RequestMethod } from '@nestjs/common';
import {
  HTTP_CODE_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants.js';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import { handlerOf, type MockPort } from '../../../../../utils/mocks.js';
import { EventImageController } from '../../../../../../src/modules/event/adapters/inbound/controllers/event-image.controller.js';
import {
  EVENT_IMAGE_SERVICE,
  type EventImageServicePort,
} from '../../../../../../src/modules/event/application/ports/inbound/services/event-image.service.port.js';

const PUBLIC_KEY = 'PUBLIC';
const session = {
  user: { id: 'org-1', role: 'ORGANIZER' },
} as unknown as UserSession;
const editor = { id: 'org-1', role: 'ORGANIZER' };

describe('EventImageController', () => {
  let controller: EventImageController;
  let images: MockPort<EventImageServicePort>;
  const reflector = new Reflector();

  beforeEach(async () => {
    images = {
      createCoverUpload: vi.fn(),
      confirmCover: vi.fn(),
      removeCover: vi.fn(),
      createPhotoUpload: vi.fn(),
      confirmPhoto: vi.fn(),
      removePhoto: vi.fn(),
      reorderPhotos: vi.fn(),
    };
    const module = await Test.createTestingModule({
      controllers: [EventImageController],
      providers: [{ provide: EVENT_IMAGE_SERVICE, useValue: images }],
    }).compile();
    controller = module.get(EventImageController);
  });

  it.each([
    [
      'createCoverUpload',
      RequestMethod.POST,
      ':id/cover/upload-url',
      undefined,
    ],
    ['confirmCover', RequestMethod.PUT, ':id/cover', undefined],
    ['removeCover', RequestMethod.DELETE, ':id/cover', 204],
    [
      'createPhotoUpload',
      RequestMethod.POST,
      ':id/photos/upload-url',
      undefined,
    ],
    ['confirmPhoto', RequestMethod.POST, ':id/photos', undefined],
    ['reorderPhotos', RequestMethod.PATCH, ':id/photos/order', undefined],
    ['removePhoto', RequestMethod.DELETE, ':id/photos/:photoId', 204],
  ] as const)(
    '%s: %s /events/%s, exige sessão',
    (method, verb, path, status) => {
      const handler = handlerOf(EventImageController, method);
      expect(Reflect.getMetadata(PATH_METADATA, EventImageController)).toBe(
        'events',
      );
      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(verb);
      expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(path);
      expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler)).toBe(status);
      expect(reflector.get(PUBLIC_KEY, handler)).toBeUndefined();
    },
  );

  it('passa id da sessão e papel como editor (nunca algo do body)', async () => {
    await controller.createCoverUpload(session, 5, {
      content_type: 'image/png',
    });
    await controller.confirmCover(session, 5, { key: 'k' });
    await controller.removeCover(session, 5);
    await controller.createPhotoUpload(session, 5, {
      content_type: 'image/webp',
    });
    await controller.confirmPhoto(session, 5, { key: 'p' });
    await controller.reorderPhotos(session, 5, { photo_ids: [2, 1] });
    await controller.removePhoto(session, 5, 9);

    expect(images.createCoverUpload).toHaveBeenCalledWith(
      5,
      editor,
      'image/png',
    );
    expect(images.confirmCover).toHaveBeenCalledWith(5, editor, 'k');
    expect(images.removeCover).toHaveBeenCalledWith(5, editor);
    expect(images.createPhotoUpload).toHaveBeenCalledWith(
      5,
      editor,
      'image/webp',
    );
    expect(images.confirmPhoto).toHaveBeenCalledWith(5, editor, 'p');
    expect(images.reorderPhotos).toHaveBeenCalledWith(5, editor, [2, 1]);
    expect(images.removePhoto).toHaveBeenCalledWith(5, editor, 9);
  });
});
