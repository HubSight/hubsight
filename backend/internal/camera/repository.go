package camera

import (
	"context"
	
	"cctv/ent"
	"cctv/internal/database"
)

func GetAll(ctx context.Context) ([]*ent.Camera, error) {
	return database.Client.Camera.Query().All(ctx)
}

func Create(ctx context.Context, name, host string) (*ent.Camera, error) {
	return database.Client.Camera.Create().
		SetName(name).
		SetHost(host).
		Save(ctx)
}

func Update(ctx context.Context, id int, name, host string) (*ent.Camera, error) {
	return database.Client.Camera.UpdateOneID(id).
		SetName(name).
		SetHost(host).
		Save(ctx)
}

func Delete(ctx context.Context, id int) error {
	return database.Client.Camera.DeleteOneID(id).Exec(ctx)
}
